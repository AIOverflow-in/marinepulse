import io
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from beanie import PydanticObjectId
from pydantic import BaseModel

from app.database import get_database
from app.dependencies import get_current_user
from app.models.criteria_set import CriteriaSet
from app.models.passage_plan_analysis import PassagePlanAnalysis
from app.models.user import User
from app.services.passage_plan_analyzer import (
    analyze_passage_plan,
    compute_summary,
    CRITERIA,
    CATEGORY_NAMES,
)

router = APIRouter(prefix="/api/passage-plans", tags=["passage-plans"])


# ─── GridFS helpers ────────────────────────────────────────────────────────────

def _bucket() -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(get_database(), bucket_name="passage_plan_files")


async def _store_pdf(filename: str, pdf_bytes: bytes) -> str:
    file_id = await _bucket().upload_from_stream(filename, pdf_bytes)
    return str(file_id)


async def _fetch_pdf(gridfs_id: str) -> bytes:
    stream = await _bucket().open_download_stream(ObjectId(gridfs_id))
    return await stream.read()


async def _delete_pdf(gridfs_id: str):
    try:
        await _bucket().delete(ObjectId(gridfs_id))
    except Exception:
        pass


# ─── serialiser ───────────────────────────────────────────────────────────────

def _serialize(analysis: PassagePlanAnalysis, include_results: bool = False) -> dict:
    d = {
        "id": str(analysis.id),
        # voyage metadata
        "vessel_name": analysis.vessel_name,
        "voyage_number": analysis.voyage_number,
        "from_port": analysis.from_port,
        "to_port": analysis.to_port,
        "voyage_date": analysis.voyage_date.isoformat() if analysis.voyage_date else None,
        # file
        "filename": analysis.filename,
        "has_file": analysis.gridfs_id is not None,
        # analysis
        "status": analysis.status,
        "overall_score": analysis.overall_score,
        "total_criteria": analysis.total_criteria,
        "criteria_met": analysis.criteria_met,
        "critical_gaps": analysis.critical_gaps,
        "error_message": analysis.error_message,
        "vessel_id": str(analysis.vessel_id) if analysis.vessel_id else None,
        "criteria_set_id": str(analysis.criteria_set_id) if analysis.criteria_set_id else None,
        "created_at": analysis.created_at.isoformat(),
    }
    if include_results:
        d["results"] = [r.model_dump() for r in analysis.results]
        criteria_meta = {c["id"]: c for c in CRITERIA}
        for r in d["results"]:
            meta = criteria_meta.get(r["id"], {})
            r["priority"] = meta.get("priority", "medium")
            r["category"] = meta.get("category", "")
            r["category_name"] = CATEGORY_NAMES.get(meta.get("category", ""), "")
            r["label"] = meta.get("label", "")
    return d


# ─── helpers ──────────────────────────────────────────────────────────────────

async def _load_criteria_for_set(criteria_set_id: Optional[str]) -> Optional[list]:
    """Return criteria list from DB, or None to fall back to built-in CRITERIA."""
    if not criteria_set_id:
        return None
    cs = await CriteriaSet.get(criteria_set_id)
    if not cs:
        return None
    return [
        {"id": c.id, "category": c.category, "label": c.label, "priority": c.priority}
        for c in cs.criteria
    ]


# ─── background task ──────────────────────────────────────────────────────────

async def _run_analysis(
    analysis_id: str,
    pdf_bytes: bytes,
    criteria_set_id: Optional[str] = None,
):
    try:
        # Load dynamic criteria (None = use built-in 80)
        criteria = await _load_criteria_for_set(criteria_set_id)

        results = await analyze_passage_plan(pdf_bytes, criteria=criteria)
        summary = compute_summary(results, criteria=criteria)

        analysis = await PassagePlanAnalysis.get(analysis_id)
        if analysis:
            analysis.results = results
            analysis.overall_score = summary["overall_score"]
            analysis.total_criteria = summary["total_criteria"]
            analysis.criteria_met = summary["criteria_met"]
            analysis.critical_gaps = summary["critical_gaps"]
            analysis.status = "complete"
            await analysis.save()
    except Exception as e:
        analysis = await PassagePlanAnalysis.get(analysis_id)
        if analysis:
            analysis.status = "failed"
            analysis.error_message = str(e)[:500]
            await analysis.save()


# ─── request body ─────────────────────────────────────────────────────────────

class CreatePassagePlanBody(BaseModel):
    vessel_name: Optional[str] = None
    voyage_number: Optional[str] = None
    from_port: Optional[str] = None
    to_port: Optional[str] = None
    voyage_date: Optional[str] = None   # ISO date string


# ─── endpoints ────────────────────────────────────────────────────────────────

@router.post("")
async def create_passage_plan(
    body: CreatePassagePlanBody,
    current_user: User = Depends(get_current_user),
):
    """Create a passage plan record (no PDF yet). Upload PDF separately via /{id}/upload."""
    voyage_dt = None
    if body.voyage_date:
        try:
            voyage_dt = datetime.fromisoformat(body.voyage_date)
        except ValueError:
            pass

    plan = PassagePlanAnalysis(
        vessel_name=body.vessel_name,
        voyage_number=body.voyage_number,
        from_port=body.from_port,
        to_port=body.to_port,
        voyage_date=voyage_dt,
        company_id=current_user.company_id or current_user.id,
        uploaded_by=current_user.id,
        status="pending",
        created_at=datetime.utcnow(),
    )
    await plan.insert()
    return _serialize(plan)


@router.post("/{analysis_id}/upload")
async def upload_pdf(
    analysis_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    criteria_set_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF to an existing passage plan record and kick off analysis.

    Optional Form field:
    - criteria_set_id: ID of the CriteriaSet to evaluate against (defaults to built-in 80 SIRE criteria)
    """
    plan = await PassagePlanAnalysis.get(analysis_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Passage plan not found")

    company_id = current_user.company_id or current_user.id
    if str(plan.company_id) != str(company_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    # Delete old file if re-uploading
    if plan.gridfs_id:
        await _delete_pdf(plan.gridfs_id)

    gridfs_id = await _store_pdf(file.filename, pdf_bytes)

    plan.filename = file.filename
    plan.gridfs_id = gridfs_id
    plan.status = "processing"
    plan.error_message = None
    plan.results = []
    plan.overall_score = 0.0
    plan.criteria_met = 0
    plan.critical_gaps = 0
    if criteria_set_id:
        plan.criteria_set_id = PydanticObjectId(criteria_set_id)
    await plan.save()

    background_tasks.add_task(
        _run_analysis,
        str(plan.id),
        pdf_bytes,
        criteria_set_id,
    )

    return {"id": str(plan.id), "status": "processing", "filename": file.filename}


@router.get("")
async def list_passage_plans(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    company_id = current_user.company_id or current_user.id
    query = PassagePlanAnalysis.find(
        PassagePlanAnalysis.company_id == PydanticObjectId(str(company_id))
    ).sort(-PassagePlanAnalysis.created_at)

    total = await query.count()
    items = await query.skip(skip).limit(limit).to_list()

    return {
        "items": [_serialize(a) for a in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/{analysis_id}")
async def get_passage_plan(
    analysis_id: str,
    current_user: User = Depends(get_current_user),
):
    plan = await PassagePlanAnalysis.get(analysis_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Passage plan not found")

    company_id = current_user.company_id or current_user.id
    if str(plan.company_id) != str(company_id):
        raise HTTPException(status_code=403, detail="Access denied")

    return _serialize(plan, include_results=True)


@router.get("/{analysis_id}/file")
async def download_pdf(
    analysis_id: str,
    current_user: User = Depends(get_current_user),
):
    plan = await PassagePlanAnalysis.get(analysis_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Passage plan not found")

    company_id = current_user.company_id or current_user.id
    if str(plan.company_id) != str(company_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if not plan.gridfs_id:
        raise HTTPException(status_code=404, detail="No PDF stored for this passage plan")

    pdf_bytes = await _fetch_pdf(plan.gridfs_id)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{plan.filename}"'},
    )


@router.put("/{analysis_id}")
async def update_passage_plan(
    analysis_id: str,
    body: CreatePassagePlanBody,
    current_user: User = Depends(get_current_user),
):
    """Update voyage metadata on a passage plan."""
    plan = await PassagePlanAnalysis.get(analysis_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Passage plan not found")

    company_id = current_user.company_id or current_user.id
    if str(plan.company_id) != str(company_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if body.vessel_name is not None:
        plan.vessel_name = body.vessel_name
    if body.voyage_number is not None:
        plan.voyage_number = body.voyage_number
    if body.from_port is not None:
        plan.from_port = body.from_port
    if body.to_port is not None:
        plan.to_port = body.to_port
    if body.voyage_date is not None:
        try:
            plan.voyage_date = datetime.fromisoformat(body.voyage_date)
        except ValueError:
            pass

    await plan.save()
    return _serialize(plan)


@router.delete("/{analysis_id}")
async def delete_passage_plan(
    analysis_id: str,
    current_user: User = Depends(get_current_user),
):
    plan = await PassagePlanAnalysis.get(analysis_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Passage plan not found")

    company_id = current_user.company_id or current_user.id
    if str(plan.company_id) != str(company_id):
        raise HTTPException(status_code=403, detail="Access denied")

    if plan.gridfs_id:
        await _delete_pdf(plan.gridfs_id)

    await plan.delete()
    return {"message": "Deleted"}
