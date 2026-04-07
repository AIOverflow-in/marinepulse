from beanie import Document, PydanticObjectId
from datetime import datetime
from typing import Optional
from enum import Enum


class FileType(str, Enum):
    image = "image"
    pdf = "pdf"


class Evidence(Document):
    inspection_id: PydanticObjectId
    inspection_score_id: PydanticObjectId
    uploaded_by: PydanticObjectId
    file_type: FileType
    file_name: str
    file_url: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    uploaded_at: datetime = datetime.utcnow()

    class Settings:
        name = "evidence"
