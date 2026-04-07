from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Union
from datetime import datetime
from beanie import PydanticObjectId
import io

from app.models.inspection import Inspection, InspectionStatus
from app.models.inspection_score import InspectionScore, ScoreEdit
from app.models.checklist_item import ChecklistItem
from app.models.evidence import Evidence, FileType
from app.models.user import UserRole, User
from app.dependencies import get_current_user, require_role
from app.services.vhi import compute_audit_score, grade_from_vhi
from app.services.report_generator import generate_report

router = APIRouter(prefix="/api/inspections", tags=["inspections"])


class InspectionCreate(BaseModel):
    vessel_id: str
    company_id: str
    template_id: str
    port: Optional[str] = None
    inspection_date: datetime
    request_id: Optional[str] = None


class ScoreUpsert(BaseModel):
    checklist_item_id: str
    score: Optional[Union[int, str]] = None  # 0-5 or "NS"
    comment: Optional[str] = None
    evidence_urls: Optional[List[str]] = None


class AdminEdit(BaseModel):
    admin_remarks: Optional[str] = None
    status: Optional[InspectionStatus] = None


class EvidenceAdd(BaseModel):
    score_id: str
    file_url: str
    file_name: str
    file_type: FileType = FileType.image


def inspection_to_dict(i: Inspection) -> dict:
    return {
        "id": str(i.id),
        "vessel_id": str(i.vessel_id),
        "company_id": str(i.company_id),
        "surveyor_id": str(i.surveyor_id) if i.surveyor_id else None,
        "template_id": str(i.template_id),
        "port": i.port,
        "inspection_date": i.inspection_date.isoformat(),
        "submitted_at": i.submitted_at.isoformat() if i.submitted_at else None,
        "reviewed_at": i.reviewed_at.isoformat() if i.reviewed_at else None,
        "status": i.status,
        "vhi_score": i.vhi_score,
        "vhi_grade": i.vhi_grade,
        "total_items": i.total_items,
        "scored_items": i.scored_items,
        "deficiency_count": i.deficiency_count,
        "critical_deficiency_count": i.critical_deficiency_count,
        "admin_remarks": i.admin_remarks,
        "created_at": i.created_at.isoformat(),
    }


@router.get("")
async def list_inspections(
    vessel_id: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    filters = []
    if vessel_id:
        filters.append(Inspection.vessel_id == PydanticObjectId(vessel_id))
    if company_id:
        filters.append(Inspection.company_id == PydanticObjectId(company_id))
    if status:
        filters.append({"status": status})
    if date_from:
        filters.append({"inspection_date": {"$gte": datetime.fromisoformat(date_from)}})
    if date_to:
        filters.append({"inspection_date": {"$lte": datetime.fromisoformat(date_to)}})

    query = Inspection.find(*filters).sort(-Inspection.inspection_date) if filters else Inspection.find_all().sort(-Inspection.inspection_date)
    total = await query.count()
    inspections = await query.skip(skip).limit(limit).to_list()
    return {"items": [inspection_to_dict(i) for i in inspections], "total": total, "skip": skip, "limit": limit}


@router.post("")
async def create_inspection(
    body: InspectionCreate,
    current_user: User = Depends(require_role(UserRole.consultancy_admin, UserRole.surveyor)),
):
    data = body.model_dump()
    data["vessel_id"] = PydanticObjectId(data["vessel_id"])
    data["company_id"] = PydanticObjectId(data["company_id"])
    data["template_id"] = PydanticObjectId(data["template_id"])
    data["surveyor_id"] = current_user.id
    if data.get("request_id"):
        data["request_id"] = PydanticObjectId(data["request_id"])

    # Count total items in template
    total_items = await ChecklistItem.find(
        ChecklistItem.template_id == data["template_id"]
    ).count()
    data["total_items"] = total_items
    data["status"] = InspectionStatus.in_progress

    inspection = Inspection(**data)
    await inspection.insert()

    # Initialize empty scores for all checklist items
    items = await ChecklistItem.find(
        ChecklistItem.template_id == inspection.template_id
    ).to_list()
    scores = [
        InspectionScore(
            inspection_id=inspection.id,
            checklist_item_id=item.id,
            category=item.category,
            assessment_type=getattr(item, "assessment_type", "static"),
            weight=item.weight,
        )
        for item in items
    ]
    if scores:
        await InspectionScore.insert_many(scores)

    return inspection_to_dict(inspection)


@router.get("/{inspection_id}")
async def get_inspection(inspection_id: str, current_user: User = Depends(get_current_user)):
    inspection = await Inspection.get(inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return inspection_to_dict(inspection)


@router.put("/{inspection_id}")
async def admin_edit_inspection(
    inspection_id: str,
    body: AdminEdit,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    inspection = await Inspection.get(inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in update and update["status"] == InspectionStatus.reviewed:
        update["reviewed_at"] = datetime.utcnow()
        update["reviewed_by"] = inspection.id  # reviewer is the current user
    await inspection.set(update)
    return inspection_to_dict(inspection)


@router.get("/{inspection_id}/scores")
async def get_scores(inspection_id: str, current_user: User = Depends(get_current_user)):
    scores = await InspectionScore.find(
        InspectionScore.inspection_id == PydanticObjectId(inspection_id)
    ).to_list()

    # Fetch item names in one query
    item_ids = [s.checklist_item_id for s in scores]
    items = await ChecklistItem.find({"_id": {"$in": item_ids}}).to_list()
    item_map = {str(item.id): item for item in items}

    return [
        {
            "id": str(s.id),
            "checklist_item_id": str(s.checklist_item_id),
            "item_name": item_map[str(s.checklist_item_id)].item_name if str(s.checklist_item_id) in item_map else "",
            "guidance_note": item_map[str(s.checklist_item_id)].guidance_note if str(s.checklist_item_id) in item_map else None,
            "category": s.category,
            "assessment_type": s.assessment_type,
            "weight": s.weight,
            "score": s.score,
            "comment": s.comment,
            "is_deficiency": s.is_deficiency,
            "evidence_urls": s.evidence_urls,
        }
        for s in scores
    ]


@router.post("/{inspection_id}/scores")
async def upsert_scores(
    inspection_id: str,
    scores: List[ScoreUpsert],
    current_user: User = Depends(get_current_user),
):
    inspection = await Inspection.get(inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if inspection.status == InspectionStatus.submitted or inspection.status == InspectionStatus.reviewed:
        raise HTTPException(status_code=400, detail="Cannot modify a submitted/reviewed inspection")

    for s in scores:
        item_id = PydanticObjectId(s.checklist_item_id)
        existing = await InspectionScore.find_one(
            InspectionScore.inspection_id == PydanticObjectId(inspection_id),
            InspectionScore.checklist_item_id == item_id,
        )
        if existing:
            update = {}
            if s.score is not None:
                if existing.score is not None and existing.score != s.score:
                    edit = ScoreEdit(
                        edited_by=current_user.id,
                        edited_at=datetime.utcnow(),
                        previous_score=existing.score,
                        previous_comment=existing.comment,
                    )
                    existing.edit_history.append(edit)
                update["score"] = s.score
                update["is_deficiency"] = isinstance(s.score, int) and s.score < 3
            if s.comment is not None:
                update["comment"] = s.comment
            if s.evidence_urls is not None:
                update["evidence_urls"] = s.evidence_urls
            if update:
                update["edit_history"] = existing.edit_history
                await existing.set(update)

    # Update scored_items count on inspection
    all_scores = await InspectionScore.find(
        InspectionScore.inspection_id == PydanticObjectId(inspection_id)
    ).to_list()
    # NS counts as scored — only None means "not yet scored"
    scored_count = sum(1 for s in all_scores if s.score is not None)
    await inspection.set({"scored_items": scored_count})

    return {"message": "Scores saved", "scored_items": scored_count}


@router.post("/{inspection_id}/submit")
async def submit_inspection(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
):
    inspection = await Inspection.get(inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if inspection.status != InspectionStatus.in_progress and inspection.status != InspectionStatus.draft:
        raise HTTPException(status_code=400, detail="Inspection is not in progress")

    scores = await InspectionScore.find(
        InspectionScore.inspection_id == PydanticObjectId(inspection_id)
    ).to_list()

    # Validate all scored
    unscored = [s for s in scores if s.score is None]
    if unscored:
        raise HTTPException(
            status_code=400,
            detail=f"{len(unscored)} items have not been scored yet",
        )

    # Compute audit score
    scores_data = [
        {"weight": s.weight, "score": s.score, "category": s.category, "assessment_type": s.assessment_type}
        for s in scores
    ]
    result = compute_audit_score(scores_data)
    percentage = result["percentage"]
    grade = grade_from_vhi(percentage)
    deficiency_count = sum(1 for s in scores if s.is_deficiency)
    critical_count = sum(1 for s in scores if s.is_deficiency and s.weight == 3)

    await inspection.set({
        "status": InspectionStatus.submitted,
        "submitted_at": datetime.utcnow(),
        "vhi_score": percentage,
        "vhi_grade": grade,
        "scored_items": len(scores),
        "deficiency_count": deficiency_count,
        "critical_deficiency_count": critical_count,
    })

    return {
        "message": "Inspection submitted successfully",
        "vhi_score": percentage,
        "vhi_grade": grade,
        "deficiency_count": deficiency_count,
        "audit_summary": result,
    }


@router.post("/{inspection_id}/evidence")
async def add_evidence(
    inspection_id: str,
    body: EvidenceAdd,
    current_user: User = Depends(get_current_user),
):
    evidence = Evidence(
        inspection_id=PydanticObjectId(inspection_id),
        inspection_score_id=PydanticObjectId(body.score_id),
        uploaded_by=current_user.id,
        file_type=body.file_type,
        file_name=body.file_name,
        file_url=body.file_url,
    )
    await evidence.insert()

    # Also add url to the score's evidence_urls
    score = await InspectionScore.get(body.score_id)
    if score:
        score.evidence_urls.append(body.file_url)
        await score.set({"evidence_urls": score.evidence_urls})

    return {"id": str(evidence.id), "file_url": body.file_url}


@router.post("/{inspection_id}/report")
async def generate_inspection_report(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
):
    inspection = await Inspection.get(inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    scores = await InspectionScore.find(
        InspectionScore.inspection_id == PydanticObjectId(inspection_id)
    ).to_list()

    item_ids = [s.checklist_item_id for s in scores]
    items = await ChecklistItem.find({"_id": {"$in": item_ids}}).to_list()
    item_map = {str(item.id): item for item in items}

    scores_data = [
        {
            "id": str(s.id),
            "checklist_item_id": str(s.checklist_item_id),
            "item_name": item_map[str(s.checklist_item_id)].item_name if str(s.checklist_item_id) in item_map else "",
            "guidance_note": item_map[str(s.checklist_item_id)].guidance_note if str(s.checklist_item_id) in item_map else None,
            "category": s.category,
            "assessment_type": s.assessment_type,
            "weight": s.weight,
            "score": s.score,
            "comment": s.comment,
            "is_deficiency": s.is_deficiency,
            "evidence_urls": s.evidence_urls,
        }
        for s in scores
    ]

    docx_bytes = generate_report(
        inspection=inspection_to_dict(inspection),
        scores=scores_data,
    )

    filename = f"audit_report_{inspection_id[:8]}.docx"
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
