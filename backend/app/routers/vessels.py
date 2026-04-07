from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from beanie import PydanticObjectId

from app.models.vessel import Vessel, VesselType, VesselStatus
from app.models.inspection import Inspection
from app.models.user import UserRole, User
from app.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/vessels", tags=["vessels"])


class VesselCreate(BaseModel):
    company_id: str
    name: str
    imo_number: str
    vessel_type: VesselType
    flag_state: str
    year_built: int
    gross_tonnage: int
    current_port: Optional[str] = None


def vessel_to_dict(v: Vessel) -> dict:
    return {
        "id": str(v.id),
        "company_id": str(v.company_id),
        "name": v.name,
        "imo_number": v.imo_number,
        "vessel_type": v.vessel_type,
        "flag_state": v.flag_state,
        "year_built": v.year_built,
        "gross_tonnage": v.gross_tonnage,
        "current_port": v.current_port,
        "status": v.status,
    }


@router.get("")
async def list_vessels(
    company_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    import re
    filters = []
    if company_id:
        filters.append(Vessel.company_id == PydanticObjectId(company_id))
    if search:
        regex = re.compile(search, re.IGNORECASE)
        filters.append({"$or": [{"name": {"$regex": search, "$options": "i"}}, {"imo_number": {"$regex": search, "$options": "i"}}]})
    if status:
        filters.append({"status": status})

    query = Vessel.find(*filters) if filters else Vessel.find_all()
    total = await query.count()
    vessels = await query.skip(skip).limit(limit).to_list()
    return {"items": [vessel_to_dict(v) for v in vessels], "total": total, "skip": skip, "limit": limit}


@router.post("")
async def create_vessel(
    body: VesselCreate,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    data = body.model_dump()
    data["company_id"] = PydanticObjectId(data["company_id"])
    vessel = Vessel(**data)
    await vessel.insert()
    return vessel_to_dict(vessel)


@router.get("/{vessel_id}")
async def get_vessel(vessel_id: str, current_user: User = Depends(get_current_user)):
    vessel = await Vessel.get(vessel_id)
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")
    return vessel_to_dict(vessel)


@router.put("/{vessel_id}")
async def update_vessel(
    vessel_id: str,
    body: dict,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    vessel = await Vessel.get(vessel_id)
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")
    await vessel.set(body)
    return vessel_to_dict(vessel)


@router.get("/{vessel_id}/inspections")
async def get_vessel_inspections(
    vessel_id: str,
    current_user: User = Depends(get_current_user),
):
    inspections = await Inspection.find(
        Inspection.vessel_id == PydanticObjectId(vessel_id)
    ).sort(-Inspection.inspection_date).to_list()
    return [
        {
            "id": str(i.id),
            "inspection_date": i.inspection_date.isoformat(),
            "status": i.status,
            "vhi_score": i.vhi_score,
            "vhi_grade": i.vhi_grade,
            "deficiency_count": i.deficiency_count,
            "port": i.port,
        }
        for i in inspections
    ]
