from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional


class MaintenanceTask(BaseModel):
    seq_number: int
    description: str
    category: str = "engine_room"   # engine_room | electrical
    performed: bool = False
    hours_actual: Optional[float] = None
    remarks: Optional[str] = None


class MaintenanceLogRecord(Document):
    log_id: PydanticObjectId
    vessel_id: PydanticObjectId
    er_tasks: List[MaintenanceTask] = []
    electrical_tasks: List[MaintenanceTask] = []
    completed_by: str = ""
    reviewed_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "maintenance_log_records"
        indexes = [
            [("log_id", 1)],
            [("vessel_id", 1)],
        ]
