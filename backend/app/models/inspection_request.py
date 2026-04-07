from beanie import Document, PydanticObjectId
from datetime import datetime
from typing import Optional
from enum import Enum


class InspectionType(str, Enum):
    routine = "routine"
    psc = "psc"
    flag_state = "flag_state"
    vetting = "vetting"
    class_survey = "class_survey"


class RequestStatus(str, Enum):
    pending = "pending"
    assigned = "assigned"
    in_progress = "in_progress"
    submitted = "submitted"
    reviewed = "reviewed"
    closed = "closed"


class Priority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class InspectionRequest(Document):
    vessel_id: PydanticObjectId
    company_id: PydanticObjectId
    requested_by: PydanticObjectId
    assigned_surveyor: Optional[PydanticObjectId] = None
    port: str
    inspection_type: InspectionType = InspectionType.routine
    scheduled_date: datetime
    due_date: Optional[datetime] = None
    checklist_template_id: Optional[PydanticObjectId] = None
    status: RequestStatus = RequestStatus.pending
    priority: Priority = Priority.medium
    notes: Optional[str] = None
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "inspection_requests"
