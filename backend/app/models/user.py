from beanie import Document
from beanie import PydanticObjectId
from datetime import datetime
from typing import Optional
from enum import Enum


class UserRole(str, Enum):
    shipping_company = "shipping_company"
    consultancy_admin = "consultancy_admin"
    surveyor = "surveyor"
    viewer = "viewer"


class User(Document):
    name: str
    email: str
    password_hash: str
    role: UserRole
    company_id: Optional[PydanticObjectId] = None
    avatar_url: Optional[str] = None
    is_active: bool = True
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "users"
