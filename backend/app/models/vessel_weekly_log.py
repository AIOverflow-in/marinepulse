from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime
from typing import List, Optional


class VesselWeeklyLog(Document):
    vessel_id: PydanticObjectId
    company_id: PydanticObjectId
    vessel_name: str
    week_number: int          # 1–52
    year: int
    created_by: PydanticObjectId
    submitted_by: Optional[PydanticObjectId] = None
    submitted_at: Optional[datetime] = None
    status: str = "draft"     # draft | submitted | reviewed
    ai_report: Optional[str] = None    # AI-generated weekly summary (markdown)
    anomalies: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "vessel_weekly_logs"
        indexes = [
            [("vessel_id", 1), ("year", 1), ("week_number", 1)],
            [("company_id", 1), ("status", 1)],
        ]
