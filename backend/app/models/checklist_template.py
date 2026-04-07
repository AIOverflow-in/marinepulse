from beanie import Document, PydanticObjectId
from datetime import datetime
from typing import Optional


class ChecklistTemplate(Document):
    name: str
    inspection_type: Optional[str] = None
    version: str = "v1.0"
    uploaded_by: Optional[PydanticObjectId] = None
    is_active: bool = True
    total_items: int = 0
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "checklist_templates"
