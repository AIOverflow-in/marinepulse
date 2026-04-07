from beanie import Document, PydanticObjectId
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class Criterion(BaseModel):
    id: str           # e.g. "A1"
    category: str     # e.g. "A"
    label: str        # e.g. "Departure port defined"
    priority: str     # "critical" | "high" | "medium" | "low"


class CriteriaSet(Document):
    name: str                                   # e.g. "SIRE 2.0 Passage Plan Criteria"
    description: Optional[str] = None
    company_id: Optional[PydanticObjectId] = None   # None = global / available to all
    criteria: List[Criterion]
    is_default: bool = False                    # shown first in dropdown
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "criteria_sets"
        indexes = [
            [("is_default", -1)],
            [("company_id", 1)],
        ]
