from beanie import Document, PydanticObjectId
from datetime import datetime
from typing import Optional
from enum import Enum


class InspectionStatus(str, Enum):
    draft = "draft"
    in_progress = "in_progress"
    submitted = "submitted"
    reviewed = "reviewed"
    closed = "closed"


class VHIGrade(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


class Inspection(Document):
    request_id: Optional[PydanticObjectId] = None
    vessel_id: PydanticObjectId
    company_id: PydanticObjectId
    surveyor_id: Optional[PydanticObjectId] = None
    template_id: PydanticObjectId
    port: Optional[str] = None
    inspection_date: datetime
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[PydanticObjectId] = None
    status: InspectionStatus = InspectionStatus.draft
    vhi_score: Optional[float] = None
    vhi_grade: Optional[VHIGrade] = None
    total_items: int = 0
    scored_items: int = 0
    deficiency_count: int = 0
    critical_deficiency_count: int = 0
    admin_remarks: Optional[str] = None
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "inspections"
        indexes = [
            [("vessel_id", 1), ("inspection_date", -1)],
            [("company_id", 1), ("vhi_score", 1)],
            [("status", 1)],
        ]
