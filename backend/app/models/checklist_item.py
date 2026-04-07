from beanie import Document, PydanticObjectId
from datetime import datetime
from typing import Optional


class ChecklistItem(Document):
    template_id: PydanticObjectId
    category: str
    assessment_type: str = "static"  # "static" or "dynamic"
    item_code: str
    item_name: str
    description: Optional[str] = None
    guidance_note: Optional[str] = None
    weight: int = 1
    sort_order: int = 0
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "checklist_items"
