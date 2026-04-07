from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from beanie import PydanticObjectId

from app.models.inspection_request import InspectionRequest, InspectionType, RequestStatus, Priority
from app.models.user import UserRole, User
from app.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/inspection-requests", tags=["inspection-requests"])


class RequestCreate(BaseModel):
    vessel_id: str
    company_id: str
    port: str
    inspection_type: InspectionType = InspectionType.routine
    scheduled_date: datetime
    due_date: Optional[datetime] = None
    checklist_template_id: Optional[str] = None
    priority: Priority = Priority.medium
    notes: Optional[str] = None


class RequestUpdate(BaseModel):
    assigned_surveyor: Optional[str] = None
    status: Optional[RequestStatus] = None
    scheduled_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    checklist_template_id: Optional[str] = None
    notes: Optional[str] = None


def req_to_dict(r: InspectionRequest) -> dict:
    return {
        "id": str(r.id),
        "vessel_id": str(r.vessel_id),
        "company_id": str(r.company_id),
        "port": r.port,
        "inspection_type": r.inspection_type,
        "scheduled_date": r.scheduled_date.isoformat(),
        "due_date": r.due_date.isoformat() if r.due_date else None,
        "status": r.status,
        "priority": r.priority,
        "assigned_surveyor": str(r.assigned_surveyor) if r.assigned_surveyor else None,
        "checklist_template_id": str(r.checklist_template_id) if r.checklist_template_id else None,
        "notes": r.notes,
        "created_at": r.created_at.isoformat(),
    }


@router.get("")
async def list_requests(
    status: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    vessel_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    filters = []
    if status:
        filters.append({"status": status})
    if company_id:
        filters.append(InspectionRequest.company_id == PydanticObjectId(company_id))
    if vessel_id:
        filters.append(InspectionRequest.vessel_id == PydanticObjectId(vessel_id))

    query = InspectionRequest.find(*filters).sort(-InspectionRequest.created_at) if filters else InspectionRequest.find_all().sort(-InspectionRequest.created_at)
    total = await query.count()
    requests = await query.skip(skip).limit(limit).to_list()
    return {"items": [req_to_dict(r) for r in requests], "total": total, "skip": skip, "limit": limit}


@router.post("")
async def create_request(
    body: RequestCreate,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    data = body.model_dump()
    data["vessel_id"] = PydanticObjectId(data["vessel_id"])
    data["company_id"] = PydanticObjectId(data["company_id"])
    data["requested_by"] = current_user.id
    if data.get("checklist_template_id"):
        data["checklist_template_id"] = PydanticObjectId(data["checklist_template_id"])
    req = InspectionRequest(**data)
    await req.insert()
    return req_to_dict(req)


@router.get("/{request_id}")
async def get_request(request_id: str, current_user: User = Depends(get_current_user)):
    req = await InspectionRequest.get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Inspection request not found")
    return req_to_dict(req)


@router.put("/{request_id}")
async def update_request(
    request_id: str,
    body: RequestUpdate,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    req = await InspectionRequest.get(request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Inspection request not found")
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "assigned_surveyor" in update_data:
        update_data["assigned_surveyor"] = PydanticObjectId(update_data["assigned_surveyor"])
        if req.status == RequestStatus.pending:
            update_data["status"] = RequestStatus.assigned
    if "checklist_template_id" in update_data:
        update_data["checklist_template_id"] = PydanticObjectId(update_data["checklist_template_id"])
    await req.set(update_data)
    return req_to_dict(req)
