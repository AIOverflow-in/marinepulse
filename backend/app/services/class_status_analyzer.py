"""
Class Status Report Analyzer
Extracts survey due dates, overdue items, outstanding findings, and generates
a prioritised task list for Vessel Managers from an IRS/class society status PDF.
"""
from __future__ import annotations

import base64
import io
import json
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI

from app.config import settings
from app.models.class_status_report import FindingItem, SurveyItem, TaskItem

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.openai_api_key)


# ─── PDF text extraction ──────────────────────────────────────────────────────

def _extract_text(pdf_bytes: bytes) -> str:
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pages = [p.extract_text() or "" for p in reader.pages]
        return "\n".join(pages)
    except Exception as e:
        logger.warning("pypdf extraction failed: %s", e)
        return ""


def _pdf_to_images_b64(pdf_bytes: bytes, max_pages: int = 15) -> List[str]:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            mat = fitz.Matrix(1.5, 1.5)
            pix = page.get_pixmap(matrix=mat)
            images.append(base64.b64encode(pix.tobytes("jpeg")).decode())
        return images
    except Exception as e:
        logger.warning("PyMuPDF image conversion failed: %s", e)
        return []


# ─── AI analysis ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert maritime classification surveyor and Vessel Manager assistant.
You are analysing a Ship State Survey Status Report (from a classification society such as IRS, Lloyd's, DNV, BV, etc.).

Your task is to extract structured data and generate a prioritised task list for the Vessel Manager.

Return a single JSON object — no markdown, no prose outside the JSON — with this exact schema:

{
  "vessel_name": "string",
  "imo_number": "string or null",
  "ir_number": "string or null",
  "flag": "string or null",
  "class_notation": "string or null",
  "report_date": "YYYY-MM-DD or null",

  "overdue_surveys": [
    {
      "name": "Annual Survey",
      "survey_type": "classification",
      "due_date": "YYYY-MM-DD or null",
      "days_overdue": 45,
      "urgency": "critical"
    }
  ],

  "upcoming_surveys": [
    {
      "name": "Intermediate Survey",
      "survey_type": "statutory",
      "due_date": "YYYY-MM-DD or null",
      "range_start": "YYYY-MM-DD or null",
      "range_end": "YYYY-MM-DD or null",
      "days_until_due": 87,
      "urgency": "high"
    }
  ],

  "outstanding_findings": [
    {
      "code": "G0306",
      "reference": "MSC25HO933/GDKU/IR",
      "description": "Fire detection system faulty loop 2 and loop 3",
      "finding_type": "statutory",
      "due_date": "YYYY-MM-DD or null",
      "action_items": ["Keep engine room manned at all times", "Frequent fire rounds"],
      "extensions": ["2025-10-03", "2025-11-04", "2025-12-03"]
    }
  ],

  "task_list": [
    {
      "priority": "critical",
      "category": "finding",
      "title": "Rectify fire detection system (loops 2 & 3)",
      "description": "Condition of Class G0306 — fire detection system faulty. Extension expires 04 Jan 2026. Coordinate with service engineer immediately.",
      "due_date": "YYYY-MM-DD or null",
      "related_code": "G0306"
    }
  ],

  "ai_summary": "markdown string: 3-5 paragraph executive summary for the Vessel Manager covering vessel status, most urgent items, outstanding conditions, and recommended next steps"
}

Extraction rules:
- survey_type: "classification" for class surveys, "statutory" for certificates/IOPP/MLC etc., "continuous" for Section J continuous survey items
- urgency: "critical" if overdue or due within 30 days, "high" if due within 90 days, "medium" if due within 6 months, "low" otherwise
- finding_type: "condition_of_class" for Section E items, "statutory" for Section F items, "additional_info" for Section H items
- For days_overdue / days_until_due: calculate relative to today's date
- task_list: generate one task per actionable finding/survey, ordered by priority (critical first)
- Include ALL overdue items from Section D AND Section J (Continuous Survey Items Due)
- Include ALL upcoming items due within 12 months from both Section D and Section J
- ai_summary: professional tone, highlight critical items first, end with recommended action plan

Today's date: """ + date.today().isoformat()


async def analyze_class_status_report(pdf_bytes: bytes) -> Dict[str, Any]:
    text = _extract_text(pdf_bytes)

    if len(text.strip()) >= 500:
        # Native PDF — send as text (cheaper + faster)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Analyse this Ship State Survey Status Report:\n\n{text[:40000]}"},
        ]
    else:
        # Scanned PDF — send as images
        images = _pdf_to_images_b64(pdf_bytes, max_pages=20)
        if not images:
            raise ValueError("Could not extract text or render images from PDF")
        content: List[Any] = [{"type": "text", "text": "Analyse this Ship State Survey Status Report (scanned PDF):"}]
        for img_b64 in images:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img_b64}", "detail": "high"},
            })
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ]

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0,
    )

    raw = response.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"GPT returned invalid JSON: {e}\n{raw[:500]}")

    return data


# ─── Model builders ───────────────────────────────────────────────────────────

def build_survey_items(raw_list: List[dict]) -> List[SurveyItem]:
    items = []
    for r in raw_list:
        items.append(SurveyItem(
            name=r.get("name", "Unknown"),
            survey_type=r.get("survey_type", "classification"),
            due_date=r.get("due_date"),
            range_start=r.get("range_start"),
            range_end=r.get("range_end"),
            days_overdue=r.get("days_overdue"),
            days_until_due=r.get("days_until_due"),
            urgency=r.get("urgency", "medium"),
        ))
    return items


def build_findings(raw_list: List[dict]) -> List[FindingItem]:
    items = []
    for r in raw_list:
        items.append(FindingItem(
            code=r.get("code", ""),
            reference=r.get("reference"),
            description=r.get("description", ""),
            finding_type=r.get("finding_type", "additional_info"),
            due_date=r.get("due_date"),
            action_items=r.get("action_items", []),
            extensions=r.get("extensions", []),
        ))
    return items


def build_tasks(raw_list: List[dict]) -> List[TaskItem]:
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items = []
    for r in raw_list:
        items.append(TaskItem(
            priority=r.get("priority", "medium"),
            category=r.get("category", "survey"),
            title=r.get("title", ""),
            description=r.get("description", ""),
            due_date=r.get("due_date"),
            related_code=r.get("related_code"),
        ))
    items.sort(key=lambda t: priority_order.get(t.priority, 99))
    return items
