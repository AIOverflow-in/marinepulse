"""
Class Status Reports Router
POST /api/class-status-reports/analyze  — upload PDF, trigger background analysis
GET  /api/class-status-reports          — list reports
GET  /api/class-status-reports/{id}     — get full report
DELETE /api/class-status-reports/{id}   — delete
"""
import io
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel

from app.database import get_database
from app.dependencies import get_current_user
from app.models.class_status_report import ClassStatusReport
from app.models.user import User
from app.services.class_status_analyzer import (
    analyze_class_status_report,
    build_findings,
    build_survey_items,
    build_tasks,
)

router = APIRouter(prefix="/api/class-status-reports", tags=["class-status-reports"])


# ─── GridFS helpers ────────────────────────────────────────────────────────────

def _bucket() -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(get_database(), bucket_name="class_status_files")


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


# ─── Serialiser ───────────────────────────────────────────────────────────────

def _serialize(r: ClassStatusReport, full: bool = False) -> dict:
    d = {
        "id": str(r.id),
        "vessel_name": r.vessel_name,
        "imo_number": r.imo_number,
        "ir_number": r.ir_number,
        "flag": r.flag,
        "class_notation": r.class_notation,
        "report_date": r.report_date,
        "filename": r.filename,
        "has_file": r.gridfs_id is not None,
        "status": r.status,
        "error_message": r.error_message,
        "overdue_count": len(r.overdue_surveys),
        "upcoming_count": len(r.upcoming_surveys),
        "findings_count": len(r.outstanding_findings),
        "task_count": len(r.task_list),
        "created_at": r.created_at.isoformat(),
    }
    if full:
        d["overdue_surveys"] = [s.model_dump() for s in r.overdue_surveys]
        d["upcoming_surveys"] = [s.model_dump() for s in r.upcoming_surveys]
        d["outstanding_findings"] = [f.model_dump() for f in r.outstanding_findings]
        d["task_list"] = [t.model_dump() for t in r.task_list]
        d["ai_summary"] = r.ai_summary
    return d


# ─── Company scope ─────────────────────────────────────────────────────────────

def _company_scope(user: User) -> Optional[str]:
    if user.role == "consultancy_admin":
        return None
    cid = user.company_id or user.id
    return str(cid)


# ─── Background task ──────────────────────────────────────────────────────────

async def _run_analysis(report_id: str, pdf_bytes: bytes):
    try:
        data = await analyze_class_status_report(pdf_bytes)

        report = await ClassStatusReport.get(report_id)
        if not report:
            return

        report.vessel_name = data.get("vessel_name", "") or ""
        report.imo_number = data.get("imo_number")
        report.ir_number = data.get("ir_number")
        report.flag = data.get("flag")
        report.class_notation = data.get("class_notation")
        report.report_date = data.get("report_date")
        report.overdue_surveys = build_survey_items(data.get("overdue_surveys", []))
        report.upcoming_surveys = build_survey_items(data.get("upcoming_surveys", []))
        report.outstanding_findings = build_findings(data.get("outstanding_findings", []))
        report.task_list = build_tasks(data.get("task_list", []))
        report.ai_summary = data.get("ai_summary")
        report.status = "complete"
        await report.save()

    except Exception as e:
        report = await ClassStatusReport.get(report_id)
        if report:
            report.status = "failed"
            report.error_message = str(e)[:500]
            await report.save()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 30 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 30 MB)")

    company_id = str(current_user.company_id or current_user.id)
    gridfs_id = await _store_pdf(file.filename, pdf_bytes)

    report = ClassStatusReport(
        filename=file.filename,
        gridfs_id=gridfs_id,
        status="processing",
        company_id=company_id,
        uploaded_by=str(current_user.id),
        created_at=datetime.utcnow(),
    )
    await report.insert()

    background_tasks.add_task(_run_analysis, str(report.id), pdf_bytes)

    return {"id": str(report.id), "status": "processing", "filename": file.filename}


@router.get("")
async def list_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    scope = _company_scope(current_user)
    filters = []
    if scope:
        filters.append(ClassStatusReport.company_id == scope)

    q = ClassStatusReport.find(*filters).sort(-ClassStatusReport.created_at)
    total = await q.count()
    items = await q.skip(skip).limit(limit).to_list()

    return {"items": [_serialize(r) for r in items], "total": total, "skip": skip, "limit": limit}


@router.get("/{report_id}")
async def get_report(
    report_id: str,
    current_user: User = Depends(get_current_user),
):
    report = await ClassStatusReport.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    scope = _company_scope(current_user)
    if scope and report.company_id != scope:
        raise HTTPException(status_code=403, detail="Access denied")

    return _serialize(report, full=True)


@router.get("/{report_id}/file")
async def download_pdf(
    report_id: str,
    current_user: User = Depends(get_current_user),
):
    report = await ClassStatusReport.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    scope = _company_scope(current_user)
    if scope and report.company_id != scope:
        raise HTTPException(status_code=403, detail="Access denied")

    if not report.gridfs_id:
        raise HTTPException(status_code=404, detail="No PDF stored")

    pdf_bytes = await _fetch_pdf(report.gridfs_id)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{report.filename}"'},
    )


class TaskUpdateRequest(BaseModel):
    status: Optional[str] = None    # "open" | "in_progress" | "closed"
    notes: Optional[str] = None


class ActionItemUpdateRequest(BaseModel):
    completed: bool


@router.patch("/{report_id}/tasks/{task_index}")
async def update_task(
    report_id: str,
    task_index: int,
    body: TaskUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    report = await ClassStatusReport.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    scope = _company_scope(current_user)
    if scope and report.company_id != scope:
        raise HTTPException(status_code=403, detail="Access denied")

    if task_index < 0 or task_index >= len(report.task_list):
        raise HTTPException(status_code=404, detail="Task not found")

    task = report.task_list[task_index]
    if body.status is not None:
        task.status = body.status
        task.closed_at = datetime.utcnow().date().isoformat() if body.status == "closed" else None
    if body.notes is not None:
        task.notes = body.notes

    await report.save()
    return task.model_dump()


@router.patch("/{report_id}/findings/{finding_index}/action-items/{item_index}")
async def update_action_item(
    report_id: str,
    finding_index: int,
    item_index: int,
    body: ActionItemUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    report = await ClassStatusReport.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    scope = _company_scope(current_user)
    if scope and report.company_id != scope:
        raise HTTPException(status_code=403, detail="Access denied")

    if finding_index < 0 or finding_index >= len(report.outstanding_findings):
        raise HTTPException(status_code=404, detail="Finding not found")

    finding = report.outstanding_findings[finding_index]
    statuses = list(finding.action_item_statuses)
    while len(statuses) < len(finding.action_items):
        statuses.append(False)

    if item_index < 0 or item_index >= len(finding.action_items):
        raise HTTPException(status_code=404, detail="Action item not found")

    statuses[item_index] = body.completed
    finding.action_item_statuses = statuses

    await report.save()
    return {"finding_index": finding_index, "item_index": item_index, "completed": body.completed}


@router.delete("/{report_id}")
async def delete_report(
    report_id: str,
    current_user: User = Depends(get_current_user),
):
    report = await ClassStatusReport.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    scope = _company_scope(current_user)
    if scope and report.company_id != scope:
        raise HTTPException(status_code=403, detail="Access denied")

    if report.gridfs_id:
        await _delete_pdf(report.gridfs_id)

    await report.delete()
    return {"message": "Deleted"}
