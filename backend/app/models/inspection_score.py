from beanie import Document, PydanticObjectId
from datetime import datetime
from typing import Optional, List, Union
from pydantic import BaseModel


class ScoreEdit(BaseModel):
    edited_by: PydanticObjectId
    edited_at: datetime
    previous_score: Optional[Union[int, str]] = None
    previous_comment: Optional[str] = None


class InspectionScore(Document):
    inspection_id: PydanticObjectId
    checklist_item_id: PydanticObjectId
    category: str
    assessment_type: str = "static"  # "static" or "dynamic"
    weight: int
    score: Optional[Union[int, str]] = None  # 0-5, "NS" (Not Sighted), or None (unscored)
    comment: Optional[str] = None
    is_deficiency: bool = False  # True only if score is int and score < 3
    evidence_urls: List[str] = []
    edit_history: List[ScoreEdit] = []
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "inspection_scores"
        indexes = [
            [("inspection_id", 1), ("checklist_item_id", 1)],
        ]
