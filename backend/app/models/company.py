from beanie import Document
from datetime import datetime
from typing import Optional


class Company(Document):
    name: str
    code: str
    logo_url: Optional[str] = None
    contact_email: Optional[str] = None
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "companies"
