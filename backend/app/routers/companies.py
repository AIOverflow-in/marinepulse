from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from app.models.company import Company
from app.models.user import UserRole
from app.dependencies import get_current_user, require_role
from app.models.user import User

router = APIRouter(prefix="/api/companies", tags=["companies"])


class CompanyCreate(BaseModel):
    name: str
    code: str
    logo_url: Optional[str] = None
    contact_email: Optional[str] = None


@router.get("")
async def list_companies(current_user: User = Depends(get_current_user)):
    companies = await Company.find_all().to_list()
    return [{"id": str(c.id), "name": c.name, "code": c.code, "contact_email": c.contact_email} for c in companies]


@router.post("")
async def create_company(
    body: CompanyCreate,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    company = Company(**body.model_dump())
    await company.insert()
    return {"id": str(company.id), "name": company.name, "code": company.code}


@router.get("/{company_id}")
async def get_company(company_id: str, current_user: User = Depends(get_current_user)):
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"id": str(company.id), "name": company.name, "code": company.code, "contact_email": company.contact_email}
