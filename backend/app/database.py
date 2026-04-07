from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

_db: AsyncIOMotorDatabase | None = None


def get_database() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialised yet")
    return _db
from app.models.company import Company
from app.models.user import User
from app.models.vessel import Vessel
from app.models.inspection_request import InspectionRequest
from app.models.checklist_template import ChecklistTemplate
from app.models.checklist_item import ChecklistItem
from app.models.inspection import Inspection
from app.models.inspection_score import InspectionScore
from app.models.evidence import Evidence
from app.models.chat_session import ChatSession
from app.models.passage_plan_analysis import PassagePlanAnalysis
from app.models.criteria_set import CriteriaSet


async def init_db():
    global _db
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db_name = settings.mongodb_uri.split("/")[-1].split("?")[0]
    _db = client[db_name]
    await init_beanie(
        database=client[db_name],
        document_models=[
            Company,
            User,
            Vessel,
            InspectionRequest,
            ChecklistTemplate,
            ChecklistItem,
            Inspection,
            InspectionScore,
            Evidence,
            ChatSession,
            PassagePlanAnalysis,
            CriteriaSet,
        ],
    )
