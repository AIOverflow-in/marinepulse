from beanie import Document, PydanticObjectId
from pydantic import BaseModel
from datetime import datetime
from typing import List


class SessionMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime = datetime.utcnow()


class ChatSession(Document):
    user_id: PydanticObjectId
    title: str
    messages: List[SessionMessage] = []
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = datetime.utcnow()

    class Settings:
        name = "chat_sessions"
