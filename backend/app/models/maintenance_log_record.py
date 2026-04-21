from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import List, Optional


MAINTENANCE_CATEGORIES = [
    "ae",           # Auxiliary Engine
    "me",           # Main Engine
    "boiler",       # Boiler / Steam
    "deck",         # Deck / Mooring
    "safety",       # Safety & LSA
    "bwts",         # Ballast Water Treatment System
    "electrical",   # Electrical / Electronics
    "troubleshoot", # Ongoing Troubleshoots
    "engine_room",  # General Engine Room (legacy / catch-all)
]


class MaintenanceTask(BaseModel):
    seq_number: int
    description: str
    category: str = "engine_room"   # one of MAINTENANCE_CATEGORIES
    performed: bool = False
    # status supersedes performed: complete | in_progress | deferred | pending
    status: Optional[str] = None
    hours_actual: Optional[float] = None
    remarks: Optional[str] = None


class MaintenanceLogRecord(Document):
    log_id: PydanticObjectId
    vessel_id: PydanticObjectId
    er_tasks: List[MaintenanceTask] = []
    electrical_tasks: List[MaintenanceTask] = []
    completed_by: str = ""
    reviewed_by: Optional[str] = None
    completion_date: Optional[date] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "maintenance_log_records"
        indexes = [
            [("log_id", 1)],
            [("vessel_id", 1)],
        ]
