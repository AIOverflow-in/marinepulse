from beanie import Document, PydanticObjectId
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class CriterionResult(BaseModel):
    id: str                        # e.g. "A1"
    present: int                   # 1 = found, 0 = missing
    confidence: str = "medium"     # "high" | "medium" | "low"
    observation: Optional[str] = None   # SIRE-style gap description (if missing)
    risk: Optional[str] = None          # safety risk statement (if missing)
    reference: Optional[str] = None     # SIRE 2.0 / ICS / ISM reference (if missing)


class PassagePlanAnalysis(Document):
    # ── voyage metadata ──────────────────────────────────────────────────────
    vessel_name: Optional[str] = None       # e.g. "M/T Star Eagle"
    voyage_number: Optional[str] = None     # e.g. "11L"
    from_port: Optional[str] = None         # e.g. "Daesan, South Korea"
    to_port: Optional[str] = None           # e.g. "Singapore"
    voyage_date: Optional[datetime] = None  # planned departure date

    # ── ownership ────────────────────────────────────────────────────────────
    vessel_id: Optional[PydanticObjectId] = None
    company_id: PydanticObjectId
    uploaded_by: PydanticObjectId
    criteria_set_id: Optional[PydanticObjectId] = None        # which criteria set was used

    # ── file ─────────────────────────────────────────────────────────────────
    filename: Optional[str] = None          # original PDF filename
    gridfs_id: Optional[str] = None         # GridFS ObjectId of stored PDF

    # ── analysis ─────────────────────────────────────────────────────────────
    # status: "pending" (no PDF yet) | "processing" | "complete" | "failed"
    status: str = "pending"
    error_message: Optional[str] = None
    overall_score: float = 0.0
    total_criteria: int = 80
    criteria_met: int = 0
    critical_gaps: int = 0
    results: List[CriterionResult] = []

    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "passage_plan_analyses"
        indexes = [
            [("company_id", 1), ("created_at", -1)],
            [("uploaded_by", 1)],
            [("status", 1)],
        ]
