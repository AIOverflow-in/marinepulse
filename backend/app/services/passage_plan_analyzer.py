"""
Passage Plan Analyzer — evaluate a PDF passage plan against SIRE criteria using GPT-5.4.

Strategy:
1. Try text extraction via pypdf (fast, cheap, works for native PDFs).
2. If extracted text is too short (<500 chars) — the PDF is scanned/image-based —
   fall back to converting pages to images with PyMuPDF and sending them to GPT-5.4 vision.
"""
from __future__ import annotations

import base64
import io
import json
import logging
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI

from app.config import settings
from app.models.passage_plan_analysis import CriterionResult

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=settings.openai_api_key)

# ─── 80 Criteria definitions ──────────────────────────────────────────────────
# priority: "critical" | "high" | "medium" | "low"

CRITERIA: List[Dict[str, str]] = [
    # A — Appraisal (A1–A20)
    {"id": "A1",  "category": "A", "label": "Departure port defined",                                "priority": "low"},
    {"id": "A2",  "category": "A", "label": "Arrival port defined",                                  "priority": "low"},
    {"id": "A3",  "category": "A", "label": "Route type defined (coastal/ocean/pilotage)",            "priority": "low"},
    {"id": "A4",  "category": "A", "label": "Charter party constraints considered",                  "priority": "low"},
    {"id": "A5",  "category": "A", "label": "Cargo-related constraints considered",                  "priority": "low"},
    {"id": "A6",  "category": "A", "label": "Charts/ENC available",                                  "priority": "high"},
    {"id": "A7",  "category": "A", "label": "Charts updated (T&P corrections)",                      "priority": "high"},
    {"id": "A8",  "category": "A", "label": "Nautical publications available",                       "priority": "high"},
    {"id": "A9",  "category": "A", "label": "Latest editions verified",                              "priority": "high"},
    {"id": "A10", "category": "A", "label": "Chart scale appropriate (largest scale used)",          "priority": "high"},
    {"id": "A11", "category": "A", "label": "Navigation warnings reviewed",                          "priority": "high"},
    {"id": "A12", "category": "A", "label": "Weather forecast considered",                           "priority": "high"},
    {"id": "A13", "category": "A", "label": "Weather routing considered (if required)",              "priority": "high"},
    {"id": "A14", "category": "A", "label": "Traffic density assessed",                              "priority": "high"},
    {"id": "A15", "category": "A", "label": "Mandatory routing systems identified",                  "priority": "high"},
    {"id": "A16", "category": "A", "label": "Critical areas identified",                             "priority": "medium"},
    {"id": "A17", "category": "A", "label": "Restricted areas identified",                           "priority": "medium"},
    {"id": "A18", "category": "A", "label": "Prohibited areas identified",                           "priority": "medium"},
    {"id": "A19", "category": "A", "label": "Port restrictions included",                            "priority": "medium"},
    {"id": "A20", "category": "A", "label": "Day/night navigation considerations",                   "priority": "medium"},
    # B — Planning (B1–B15)
    {"id": "B1",  "category": "B", "label": "Berth-to-berth planning",                               "priority": "medium"},
    {"id": "B2",  "category": "B", "label": "Waypoints defined",                                     "priority": "medium"},
    {"id": "B3",  "category": "B", "label": "Courses plotted",                                       "priority": "medium"},
    {"id": "B4",  "category": "B", "label": "Distances calculated",                                  "priority": "medium"},
    {"id": "B5",  "category": "B", "label": "Wheel-over positions defined",                          "priority": "medium"},
    {"id": "B6",  "category": "B", "label": "No-go areas marked",                                    "priority": "critical"},
    {"id": "B7",  "category": "B", "label": "Danger points identified",                              "priority": "high"},
    {"id": "B8",  "category": "B", "label": "Traffic crossing areas marked",                         "priority": "high"},
    {"id": "B9",  "category": "B", "label": "Tidal/current areas marked",                            "priority": "high"},
    {"id": "B10", "category": "B", "label": "Overhead hazards identified",                           "priority": "high"},
    {"id": "B11", "category": "B", "label": "ECA zones identified",                                  "priority": "medium"},
    {"id": "B12", "category": "B", "label": "MARPOL requirements included",                          "priority": "medium"},
    {"id": "B13", "category": "B", "label": "Ballast water exchange planned",                        "priority": "medium"},
    {"id": "B14", "category": "B", "label": "Emission control measures included",                    "priority": "medium"},
    {"id": "B15", "category": "B", "label": "Pollution-sensitive areas identified",                  "priority": "medium"},
    # C — Execution (C1–C15)
    {"id": "C1",  "category": "C", "label": "Position fixing method defined",                        "priority": "high"},
    {"id": "C2",  "category": "C", "label": "Multiple fixing methods used",                          "priority": "high"},
    {"id": "C3",  "category": "C", "label": "Fixing interval defined",                               "priority": "high"},
    {"id": "C4",  "category": "C", "label": "Cross-track error limits defined",                      "priority": "high"},
    {"id": "C5",  "category": "C", "label": "Parallel indexing planned",                             "priority": "high"},
    {"id": "C6",  "category": "C", "label": "Watch conditions defined",                              "priority": "medium"},
    {"id": "C7",  "category": "C", "label": "Master call criteria defined",                          "priority": "medium"},
    {"id": "C8",  "category": "C", "label": "Roles/responsibilities defined",                        "priority": "medium"},
    {"id": "C9",  "category": "C", "label": "Communication protocol defined",                        "priority": "medium"},
    {"id": "C10", "category": "C", "label": "Bridge team awareness ensured",                         "priority": "medium"},
    {"id": "C11", "category": "C", "label": "Safe speed defined",                                    "priority": "medium"},
    {"id": "C12", "category": "C", "label": "Speed variation planned",                               "priority": "medium"},
    {"id": "C13", "category": "C", "label": "Machinery status changes noted",                        "priority": "medium"},
    {"id": "C14", "category": "C", "label": "Manual steering requirements identified",               "priority": "medium"},
    {"id": "C15", "category": "C", "label": "Anchors readiness defined",                             "priority": "medium"},
    # D — UKC & Clearance (D1–D7)
    {"id": "D1",  "category": "D", "label": "UKC calculation performed",                             "priority": "critical"},
    {"id": "D2",  "category": "D", "label": "Dynamic UKC considered",                                "priority": "critical"},
    {"id": "D3",  "category": "D", "label": "Squat effect considered",                               "priority": "critical"},
    {"id": "D4",  "category": "D", "label": "Tidal variations included",                             "priority": "critical"},
    {"id": "D5",  "category": "D", "label": "UKC meets minimum limits",                              "priority": "critical"},
    {"id": "D6",  "category": "D", "label": "Overhead clearance calculated",                         "priority": "high"},
    {"id": "D7",  "category": "D", "label": "Air draft considered",                                  "priority": "high"},
    # E — Contingency (E1–E7)
    {"id": "E1",  "category": "E", "label": "Steering failure contingency",                          "priority": "critical"},
    {"id": "E2",  "category": "E", "label": "Engine failure contingency",                            "priority": "critical"},
    {"id": "E3",  "category": "E", "label": "Blackout contingency",                                  "priority": "critical"},
    {"id": "E4",  "category": "E", "label": "Abort points defined",                                  "priority": "high"},
    {"id": "E5",  "category": "E", "label": "Points of no return defined",                           "priority": "high"},
    {"id": "E6",  "category": "E", "label": "Emergency anchorage identified",                        "priority": "high"},
    {"id": "E7",  "category": "E", "label": "Places of refuge identified",                           "priority": "high"},
    # F — Reporting (F1–F4)
    {"id": "F1",  "category": "F", "label": "VTS reporting points identified",                       "priority": "medium"},
    {"id": "F2",  "category": "F", "label": "VHF channels listed",                                   "priority": "medium"},
    {"id": "F3",  "category": "F", "label": "Mandatory reporting systems included",                  "priority": "medium"},
    {"id": "F4",  "category": "F", "label": "Navigation status reporting defined",                   "priority": "medium"},
    # G — Documentation (G1–G6)
    {"id": "G1",  "category": "G", "label": "Passage plan completed",                                "priority": "low"},
    {"id": "G2",  "category": "G", "label": "Master approval/signature",                             "priority": "low"},
    {"id": "G3",  "category": "G", "label": "Bridge team signatures",                                "priority": "low"},
    {"id": "G4",  "category": "G", "label": "Pre-departure review conducted",                        "priority": "low"},
    {"id": "G5",  "category": "G", "label": "Plan discussed with team",                              "priority": "low"},
    {"id": "G6",  "category": "G", "label": "Plan updated where required",                           "priority": "low"},
    # H — Quality (H1–H6)
    {"id": "H1",  "category": "H", "label": "Risks explicitly stated",                               "priority": "medium"},
    {"id": "H2",  "category": "H", "label": "Instructions are clear (not vague)",                    "priority": "medium"},
    {"id": "H3",  "category": "H", "label": "Evidence-based planning (not generic)",                 "priority": "medium"},
    {"id": "H4",  "category": "H", "label": "Consistency across plan",                               "priority": "medium"},
    {"id": "H5",  "category": "H", "label": "Monitoring instructions specific",                      "priority": "medium"},
    {"id": "H6",  "category": "H", "label": "Human factors considered",                              "priority": "medium"},
]

CRITERIA_BY_ID: Dict[str, Dict[str, str]] = {c["id"]: c for c in CRITERIA}

CRITICAL_IDS = {c["id"] for c in CRITERIA if c["priority"] == "critical"}

CATEGORY_NAMES = {
    "A": "Appraisal",
    "B": "Planning",
    "C": "Execution",
    "D": "UKC & Clearance",
    "E": "Contingency",
    "F": "Reporting",
    "G": "Documentation",
    "H": "Quality",
}

# ─── PDF helpers ──────────────────────────────────────────────────────────────

def extract_pdf_text(file_bytes: bytes) -> str:
    """Extract all text from a PDF using pypdf (works for native/digital PDFs)."""
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(f"--- Page {i + 1} ---\n{text}")
    return "\n\n".join(pages)


def _pdf_to_images_b64(file_bytes: bytes, max_pages: int = 16) -> List[str]:
    """Render each PDF page to a PNG and return base64-encoded strings.
    Uses PyMuPDF (fitz) — works on scanned/image-based PDFs."""
    import fitz  # pymupdf
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    images: List[str] = []
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        # 150 DPI is enough for GPT vision to read tables clearly
        mat = fitz.Matrix(150 / 72, 150 / 72)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        images.append(base64.b64encode(img_bytes).decode())
    return images


# ─── GPT-4o analysis ──────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a SIRE 2.0 compliant maritime auditor with deep expertise in passage planning.
You will be given the extracted text of a passage plan document, followed by evaluation criteria.

IMPORTANT — Document format awareness:
The text is machine-extracted from a multi-page maritime PDF. It will contain:
- Dense waypoint tables (WP numbers, lat/lon coordinates, courses, distances, speeds, UKC values)
- NM15 / UKC calculation sheets with tabular safety depth figures and dynamic UKC values
- Admiralty publications lists, tide tables, current charts
- Navigation meeting minutes with attendee names and signatures
- ECDIS safety parameter tables
- MARPOL / environmental aspect checklists

Do NOT require polished prose. Evidence of a criterion can appear in ANY form:
tabular data, abbreviated notes, codes, or references to attached sheets.

Examples of implicit evidence:
- A1 (Departure port defined): "FROM: DAESAN" in any table header → present = 1
- D1 (UKC calculation performed): any NM15 sheet, UKC column in waypoint table, or squat calculation table → present = 1
- D3 (Squat effect considered): any squat calculation sheet or squat allowance row → present = 1
- D4 (Tidal variations included): tide table pages or "Predicted height of tide" rows → present = 1
- G2 (Master approval/signature): "Master:" with a name/signature line → present = 1
- G3 (Bridge team signatures): navigation meeting attendee signature table → present = 1
- F2 (VHF channels listed): any VHF channel numbers (e.g., "Ch.16") → present = 1
- A8 (Nautical publications available): any list of Admiralty NPs, ENPs, or eNPs → present = 1

Marking guidance:
- present = 1 if there is ANY evidence, direct or implied, in the document
- present = 0 ONLY if the criterion is genuinely absent — no mention, no table, no reference
- confidence = "high" if you are very certain; "medium" if the evidence is indirect; "low" if you are guessing
- If present = 0: write a concise SIRE-style observation (1–2 sentences on the specific gap),
  a risk statement (1 sentence on the safety implication), and an authoritative reference
  (e.g. "SIRE 2.0 VIQ 6.32", "ICS Bridge Procedures Guide Sec 3.2", "ISM Code 10.3",
  "IMO MSC-Circ.1533", "STCW Reg. VIII/2")
- If present = 1: leave observation, risk, reference as null

Return ONLY a valid JSON object with this exact shape — no text outside the JSON:
{
  "results": [
    {
      "id": "A1",
      "present": 1,
      "confidence": "high",
      "observation": null,
      "risk": null,
      "reference": null
    }
  ]
}
"""

def _build_criteria_text() -> str:
    lines = []
    for c in CRITERIA:
        lines.append(f"{c['id']} [{c['priority'].upper()}] — {c['label']}")
    return "\n".join(lines)

_CRITERIA_TEXT = _build_criteria_text()


def _parse_gpt_response(raw: str, active_criteria: List[Dict]) -> List[CriterionResult]:
    """Parse GPT JSON response into a full CriterionResult list."""
    data = json.loads(raw)
    raw_results: List[Dict[str, Any]] = data.get("results", [])
    result_map: Dict[str, Dict] = {r["id"]: r for r in raw_results if "id" in r}
    out: List[CriterionResult] = []
    for c in active_criteria:
        r = result_map.get(c["id"], {})
        out.append(CriterionResult(
            id=c["id"],
            present=int(r.get("present", 0)),
            confidence=r.get("confidence", "low"),
            observation=r.get("observation"),
            risk=r.get("risk"),
            reference=r.get("reference"),
        ))
    return out


async def analyze_passage_plan(
    pdf_bytes: bytes,
    criteria: Optional[List[Dict[str, str]]] = None,
) -> List[CriterionResult]:
    """Evaluate a passage plan PDF against criteria using GPT-5.4.

    Automatically selects strategy:
    - Native PDF  → text extraction (pypdf) → GPT text mode
    - Scanned PDF → page images (PyMuPDF) → GPT vision mode
    """
    active_criteria = criteria if criteria is not None else CRITERIA
    total = len(active_criteria)
    criteria_lines = "\n".join(
        f"{c['id']} [{c['priority'].upper()}] — {c['label']}"
        for c in active_criteria
    )

    pdf_text = extract_pdf_text(pdf_bytes)
    use_vision = len(pdf_text.strip()) < 500

    logger.info(
        "analyze_passage_plan: text_len=%d strategy=%s criteria=%d",
        len(pdf_text), "vision" if use_vision else "text", total,
    )

    if use_vision:
        return await _analyze_via_vision(pdf_bytes, active_criteria, criteria_lines, total)
    else:
        return await _analyze_via_text(pdf_text, active_criteria, criteria_lines, total)


async def _analyze_via_text(
    pdf_text: str,
    active_criteria: List[Dict],
    criteria_lines: str,
    total: int,
) -> List[CriterionResult]:
    user_content = (
        f"PASSAGE PLAN TEXT:\n{pdf_text[:40000]}\n\n"
        f"CRITERIA TO EVALUATE ({total} total):\n{criteria_lines}"
    )
    response = await client.chat.completions.create(
        model="gpt-5.4",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    return _parse_gpt_response(response.choices[0].message.content, active_criteria)


async def _analyze_via_vision(
    pdf_bytes: bytes,
    active_criteria: List[Dict],
    criteria_lines: str,
    total: int,
) -> List[CriterionResult]:
    images = _pdf_to_images_b64(pdf_bytes, max_pages=16)
    logger.info("analyze_passage_plan (vision): rendered %d pages", len(images))

    content: List[Any] = [
        {
            "type": "text",
            "text": (
                f"Below are all {len(images)} pages of the passage plan as images.\n\n"
                f"CRITERIA TO EVALUATE ({total} total):\n{criteria_lines}"
            ),
        }
    ]
    for i, b64 in enumerate(images):
        content.append({"type": "text", "text": f"Page {i + 1}:"})
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{b64}",
                "detail": "low",
            },
        })

    response = await client.chat.completions.create(
        model="gpt-5.4",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": content},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    return _parse_gpt_response(response.choices[0].message.content, active_criteria)


# ─── Summary statistics ────────────────────────────────────────────────────────

def compute_summary(
    results: List[CriterionResult],
    criteria: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    active_criteria = criteria if criteria is not None else CRITERIA
    critical_ids = {c["id"] for c in active_criteria if c.get("priority") == "critical"}

    criteria_met = sum(1 for r in results if r.present == 1)
    total = len(results)
    overall_score = round((criteria_met / total) * 100, 1) if total > 0 else 0.0
    critical_gaps = sum(
        1 for r in results
        if r.present == 0 and r.id in critical_ids
    )
    return {
        "overall_score": overall_score,
        "total_criteria": total,
        "criteria_met": criteria_met,
        "critical_gaps": critical_gaps,
    }
