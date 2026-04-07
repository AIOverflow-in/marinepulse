from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from pydantic import BaseModel
from typing import Optional
from beanie import PydanticObjectId

from app.models.checklist_template import ChecklistTemplate
from app.models.checklist_item import ChecklistItem
from app.models.user import UserRole, User
from app.dependencies import get_current_user, require_role
from app.services.csv_parser import parse_checklist_csv

router = APIRouter(prefix="/api/checklists", tags=["checklists"])


@router.get("")
async def list_templates(
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    filters = [ChecklistTemplate.is_active == True]
    if search:
        filters.append({"name": {"$regex": search, "$options": "i"}})

    query = ChecklistTemplate.find(*filters)
    total = await query.count()
    templates = await query.skip(skip).limit(limit).to_list()
    return {
        "items": [
            {
                "id": str(t.id),
                "name": t.name,
                "version": t.version,
                "total_items": t.total_items,
                "inspection_type": t.inspection_type,
                "created_at": t.created_at.isoformat(),
            }
            for t in templates
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/{template_id}")
async def get_template(template_id: str, current_user: User = Depends(get_current_user)):
    template = await ChecklistTemplate.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    items = await ChecklistItem.find(
        ChecklistItem.template_id == PydanticObjectId(template_id)
    ).sort(ChecklistItem.sort_order).to_list()
    return {
        "id": str(template.id),
        "name": template.name,
        "version": template.version,
        "total_items": template.total_items,
        "items": [
            {
                "id": str(item.id),
                "category": item.category,
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "weight": item.weight,
                "sort_order": item.sort_order,
            }
            for item in items
        ],
    }


@router.post("/upload")
async def upload_checklist(
    file: UploadFile = File(...),
    name: str = Form(...),
    version: str = Form("v1.0"),
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    content = (await file.read()).decode("utf-8")
    parsed_items = parse_checklist_csv(content)

    if not parsed_items:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV")

    template = ChecklistTemplate(
        name=name,
        version=version,
        uploaded_by=current_user.id,
        total_items=len(parsed_items),
    )
    await template.insert()

    items = [
        ChecklistItem(
            template_id=template.id,
            **item,
        )
        for item in parsed_items
    ]
    await ChecklistItem.insert_many(items)

    return {
        "id": str(template.id),
        "name": template.name,
        "total_items": template.total_items,
        "message": f"Successfully imported {len(items)} checklist items",
    }


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    template = await ChecklistTemplate.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await template.set({ChecklistTemplate.is_active: False})
    return {"message": "Template deactivated"}
