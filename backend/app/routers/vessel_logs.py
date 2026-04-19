"""
AuditVault AI — Vessel Logs Router
All endpoints prefixed /api/vessel-logs
"""
import io
import math
from datetime import datetime, date
from typing import Optional, List

from beanie import PydanticObjectId
from bson import ObjectId
from fastapi import (
    APIRouter, BackgroundTasks, Body, Depends,
    File, Form, HTTPException, Query, UploadFile,
)
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel

from app.database import get_database
from app.dependencies import get_current_user
from app.models.drill_record import DrillRecord, DRILL_TYPE_LABELS
from app.models.maintenance_log_record import MaintenanceLogRecord, MaintenanceTask
from app.models.maintenance_photo import MaintenancePhoto, PHOTO_CATEGORIES
from app.models.me_performance_record import MEPerformanceRecord, CylinderData
from app.models.safety_check_record import (
    SafetyCheckRecord, WeeklyCheckItem, PeriodicCheckItem, build_blank_safety_check,
)
from app.models.vessel_weekly_log import VesselWeeklyLog
from app.models.user import User
from app.services.log_analyzer import detect_anomalies, get_overdue_alerts, generate_weekly_report, get_compliance_calendar

router = APIRouter(prefix="/api/vessel-logs", tags=["vessel-logs"])


# ─── GridFS helpers ────────────────────────────────────────────────────────────

def _photo_bucket() -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(get_database(), bucket_name="maintenance_photos")


async def _store_photo(filename: str, data: bytes) -> str:
    file_id = await _photo_bucket().upload_from_stream(filename, data)
    return str(file_id)


async def _fetch_photo(gridfs_id: str) -> bytes:
    stream = await _photo_bucket().open_download_stream(ObjectId(gridfs_id))
    return await stream.read()


async def _delete_photo_file(gridfs_id: str):
    try:
        await _photo_bucket().delete(ObjectId(gridfs_id))
    except Exception:
        pass


# ─── Image compression ────────────────────────────────────────────────────────

def _compress_image(data: bytes, target_kb: int = 200) -> tuple[bytes, int]:
    """Compress image to target_kb using Pillow. Returns (compressed_bytes, size_kb)."""
    try:
        from PIL import Image
        import io as _io

        img = Image.open(_io.BytesIO(data))

        # Extract EXIF date if available
        # Resize to max 1200px on longest edge
        max_dim = 1200
        w, h = img.size
        if max(w, h) > max_dim:
            ratio = max_dim / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

        # Convert to RGB if needed (handles PNG transparency)
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")

        quality = 75
        while quality >= 20:
            buf = _io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            size_kb = len(buf.getvalue()) // 1024
            if size_kb <= target_kb:
                return buf.getvalue(), size_kb
            quality -= 5

        buf = _io.BytesIO()
        img.save(buf, format="JPEG", quality=20, optimize=True)
        return buf.getvalue(), len(buf.getvalue()) // 1024

    except Exception:
        # If Pillow fails, return original
        return data, len(data) // 1024


def _extract_exif_date(data: bytes) -> Optional[datetime]:
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS
        import io as _io
        img = Image.open(_io.BytesIO(data))
        exif = img._getexif()
        if exif:
            for tag, val in exif.items():
                if TAGS.get(tag) == "DateTimeOriginal":
                    return datetime.strptime(val, "%Y:%m:%d %H:%M:%S")
    except Exception:
        pass
    return None


# ─── Auth helpers ──────────────────────────────────────────────────────────────

def _company_id(user: User) -> PydanticObjectId:
    return user.company_id or user.id


def _is_admin(user: User) -> bool:
    return user.role in ("consultancy_admin",)


def _check_log_access(log: VesselWeeklyLog, user: User):
    if _is_admin(user):
        return
    if str(log.company_id) != str(_company_id(user)):
        raise HTTPException(status_code=403, detail="Access denied")


# ─── Serialisers ──────────────────────────────────────────────────────────────

def _serialize_log(log: VesselWeeklyLog, summary: Optional[dict] = None) -> dict:
    d = {
        "id": str(log.id),
        "vessel_id": str(log.vessel_id),
        "vessel_name": log.vessel_name,
        "week_number": log.week_number,
        "year": log.year,
        "status": log.status,
        "ai_report": log.ai_report,
        "anomalies": log.anomalies,
        "created_at": log.created_at.isoformat(),
        "submitted_at": log.submitted_at.isoformat() if log.submitted_at else None,
    }
    if summary:
        d.update(summary)
    return d


async def _log_summary(log_id) -> dict:
    """Compute completion flags for a weekly log."""
    lid = log_id if isinstance(log_id, PydanticObjectId) else PydanticObjectId(str(log_id))
    safety = await SafetyCheckRecord.find_one(SafetyCheckRecord.log_id == lid)
    maintenance = await MaintenanceLogRecord.find_one(MaintenanceLogRecord.log_id == lid)
    photo_count = await MaintenancePhoto.find(MaintenancePhoto.log_id == lid).count()
    drill_count = await DrillRecord.find(DrillRecord.log_id == lid).count()
    me = await MEPerformanceRecord.find_one(MEPerformanceRecord.log_id == lid)
    return {
        "has_safety_checks": safety is not None,
        "has_maintenance_log": maintenance is not None,
        "photo_count": photo_count,
        "drill_count": drill_count,
        "has_me_performance": me is not None,
    }


# ─── Weekly Log Container ─────────────────────────────────────────────────────

class CreateLogBody(BaseModel):
    vessel_id: str
    vessel_name: str
    week_number: int
    year: int


@router.get("")
async def list_logs(
    vessel_id: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    query_filters = []
    if not _is_admin(current_user):
        query_filters.append(VesselWeeklyLog.company_id == _company_id(current_user))
    if vessel_id:
        query_filters.append(VesselWeeklyLog.vessel_id == PydanticObjectId(vessel_id))
    if year:
        query_filters.append(VesselWeeklyLog.year == year)
    if status:
        query_filters.append(VesselWeeklyLog.status == status)

    q = VesselWeeklyLog.find(*query_filters).sort(-VesselWeeklyLog.created_at)
    total = await q.count()
    items = await q.skip(skip).limit(limit).to_list()

    serialized = []
    for log in items:
        summary = await _log_summary(log.id)
        serialized.append(_serialize_log(log, summary))

    return {"items": serialized, "total": total, "skip": skip, "limit": limit}


@router.post("")
async def create_log(
    body: CreateLogBody,
    current_user: User = Depends(get_current_user),
):
    from app.models.vessel import Vessel as VesselModel
    vessel_obj = await VesselModel.get(PydanticObjectId(body.vessel_id))
    if not vessel_obj:
        raise HTTPException(status_code=404, detail="Vessel not found")
    log_company_id = vessel_obj.company_id

    existing = await VesselWeeklyLog.find_one(
        VesselWeeklyLog.vessel_id == PydanticObjectId(body.vessel_id),
        VesselWeeklyLog.week_number == body.week_number,
        VesselWeeklyLog.year == body.year,
        VesselWeeklyLog.company_id == log_company_id,
    )
    if existing:
        raise HTTPException(status_code=409, detail="Weekly log already exists for this vessel and week")

    log = VesselWeeklyLog(
        vessel_id=PydanticObjectId(body.vessel_id),
        company_id=log_company_id,
        vessel_name=body.vessel_name,
        week_number=body.week_number,
        year=body.year,
        created_by=current_user.id,
    )
    await log.insert()
    summary = await _log_summary(log.id)
    return _serialize_log(log, summary)


@router.get("/compliance-calendar")
async def compliance_calendar(
    year: int = Query(...),
    current_user: User = Depends(get_current_user),
):
    company_filter = None if _is_admin(current_user) else str(_company_id(current_user))
    data = await get_compliance_calendar(company_filter, year)
    return {"year": year, "vessels": data}


@router.get("/overdue-alerts")
async def overdue_alerts(
    vessel_id: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    alerts = await get_overdue_alerts(vessel_id)
    return {"vessel_id": vessel_id, "alerts": alerts}


@router.get("/{log_id}")
async def get_log(
    log_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)
    summary = await _log_summary(log.id)
    return _serialize_log(log, summary)


@router.delete("/{log_id}")
async def delete_log(
    log_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    lid = log.id
    # Delete all child records
    await SafetyCheckRecord.find(SafetyCheckRecord.log_id == lid).delete()
    await MaintenanceLogRecord.find(MaintenanceLogRecord.log_id == lid).delete()
    # Delete photos from GridFS too
    photos = await MaintenancePhoto.find(MaintenancePhoto.log_id == lid).to_list()
    for photo in photos:
        if photo.gridfs_id:
            await _delete_photo_file(photo.gridfs_id)
    await MaintenancePhoto.find(MaintenancePhoto.log_id == lid).delete()
    await DrillRecord.find(DrillRecord.log_id == lid).delete()
    await MEPerformanceRecord.find(MEPerformanceRecord.log_id == lid).delete()
    await log.delete()

    return {"message": "Deleted"}


@router.post("/{log_id}/submit")
async def submit_log(
    log_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    log.status = "submitted"
    log.submitted_by = current_user.id
    log.submitted_at = datetime.utcnow()
    await log.save()

    background_tasks.add_task(_run_ai_report, log_id)

    return {"id": log_id, "status": "submitted", "message": "AI report generation started"}


async def _run_ai_report(log_id: str):
    try:
        await generate_weekly_report(log_id)
    except Exception as e:
        log = await VesselWeeklyLog.get(log_id)
        if log:
            log.ai_report = f"⚠️ Report generation failed: {str(e)}"
            await log.save()


@router.get("/{log_id}/ai-report")
async def get_ai_report(
    log_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)
    return {"log_id": log_id, "ai_report": log.ai_report, "anomalies": log.anomalies}


# ─── T-01: Safety Checks ──────────────────────────────────────────────────────

class SafetyCheckBody(BaseModel):
    completed_by: str
    position: str
    week_items: list
    monthly_items: list
    quarterly_items: list


@router.get("/{log_id}/safety-checks")
async def get_safety_checks(
    log_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    rec = await SafetyCheckRecord.find_one(SafetyCheckRecord.log_id == log.id)

    if rec is None:
        # Return blank template so the frontend can render an empty form
        blank = build_blank_safety_check()
        return {"id": None, "log_id": log_id, **blank, "completed_by": "", "position": ""}

    return {
        "id": str(rec.id),
        "log_id": log_id,
        "completed_by": rec.completed_by,
        "position": rec.position,
        "week_items": [i.model_dump() for i in rec.week_items],
        "monthly_items": [i.model_dump() for i in rec.monthly_items],
        "quarterly_items": [i.model_dump() for i in rec.quarterly_items],
        "created_at": rec.created_at.isoformat(),
        "updated_at": rec.updated_at.isoformat(),
    }


@router.post("/{log_id}/safety-checks")
async def upsert_safety_checks(
    log_id: str,
    body: SafetyCheckBody,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    rec = await SafetyCheckRecord.find_one(SafetyCheckRecord.log_id == log.id)

    week_items = [WeeklyCheckItem(**i) for i in body.week_items]
    monthly_items = [PeriodicCheckItem(**i) for i in body.monthly_items]
    quarterly_items = [PeriodicCheckItem(**i) for i in body.quarterly_items]

    now = datetime.utcnow()
    if rec is None:
        rec = SafetyCheckRecord(
            log_id=log.id,
            vessel_id=log.vessel_id,
            completed_by=body.completed_by,
            position=body.position,
            week_items=week_items,
            monthly_items=monthly_items,
            quarterly_items=quarterly_items,
            updated_at=now,
        )
        await rec.insert()
    else:
        rec.completed_by = body.completed_by
        rec.position = body.position
        rec.week_items = week_items
        rec.monthly_items = monthly_items
        rec.quarterly_items = quarterly_items
        rec.updated_at = now
        await rec.save()

    return {
        "id": str(rec.id),
        "log_id": log_id,
        "completed_by": rec.completed_by,
        "position": rec.position,
        "week_items": [i.model_dump() for i in rec.week_items],
        "monthly_items": [i.model_dump() for i in rec.monthly_items],
        "quarterly_items": [i.model_dump() for i in rec.quarterly_items],
        "created_at": rec.created_at.isoformat(),
        "updated_at": rec.updated_at.isoformat(),
    }


# ─── T-02: Maintenance Log ────────────────────────────────────────────────────

class MaintenanceLogBody(BaseModel):
    er_tasks: list
    electrical_tasks: list
    completed_by: str = ""
    reviewed_by: Optional[str] = None


@router.get("/{log_id}/maintenance-log")
async def get_maintenance_log(
    log_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    rec = await MaintenanceLogRecord.find_one(MaintenanceLogRecord.log_id == log.id)
    if rec is None:
        return {"id": None, "log_id": log_id, "er_tasks": [], "electrical_tasks": [], "completed_by": ""}

    return {
        "id": str(rec.id),
        "log_id": log_id,
        "er_tasks": [t.model_dump() for t in rec.er_tasks],
        "electrical_tasks": [t.model_dump() for t in rec.electrical_tasks],
        "completed_by": rec.completed_by,
        "reviewed_by": rec.reviewed_by,
        "created_at": rec.created_at.isoformat(),
        "updated_at": rec.updated_at.isoformat(),
    }


@router.post("/{log_id}/maintenance-log")
async def upsert_maintenance_log(
    log_id: str,
    body: MaintenanceLogBody,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    er_tasks = [MaintenanceTask(**t) for t in body.er_tasks]
    el_tasks = [MaintenanceTask(**t) for t in body.electrical_tasks]
    now = datetime.utcnow()

    rec = await MaintenanceLogRecord.find_one(MaintenanceLogRecord.log_id == log.id)
    if rec is None:
        rec = MaintenanceLogRecord(
            log_id=log.id,
            vessel_id=log.vessel_id,
            er_tasks=er_tasks,
            electrical_tasks=el_tasks,
            completed_by=body.completed_by,
            reviewed_by=body.reviewed_by,
            updated_at=now,
        )
        await rec.insert()
    else:
        rec.er_tasks = er_tasks
        rec.electrical_tasks = el_tasks
        rec.completed_by = body.completed_by
        rec.reviewed_by = body.reviewed_by
        rec.updated_at = now
        await rec.save()

    return {
        "id": str(rec.id),
        "log_id": log_id,
        "er_tasks": [t.model_dump() for t in rec.er_tasks],
        "electrical_tasks": [t.model_dump() for t in rec.electrical_tasks],
        "completed_by": rec.completed_by,
        "reviewed_by": rec.reviewed_by,
        "created_at": rec.created_at.isoformat(),
        "updated_at": rec.updated_at.isoformat(),
    }


# ─── T-03: Photos ─────────────────────────────────────────────────────────────

@router.get("/{log_id}/photos")
async def list_photos(
    log_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    photos = await MaintenancePhoto.find(
        MaintenancePhoto.log_id == log.id
    ).sort(MaintenancePhoto.uploaded_at).to_list()

    return [_serialize_photo(p) for p in photos]


def _serialize_photo(p: MaintenancePhoto) -> dict:
    return {
        "id": str(p.id),
        "log_id": str(p.log_id),
        "original_filename": p.original_filename,
        "caption": p.caption,
        "category": p.category,
        "location_tag": p.location_tag,
        "file_size_kb": p.file_size_kb,
        "taken_at": p.taken_at.isoformat() if p.taken_at else None,
        "uploaded_at": p.uploaded_at.isoformat(),
        "has_file": p.gridfs_id is not None,
    }


@router.post("/{log_id}/photos")
async def upload_photo(
    log_id: str,
    file: UploadFile = File(...),
    caption: str = Form(...),
    category: str = Form("other"),
    location_tag: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are accepted")

    raw = await file.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    if category not in PHOTO_CATEGORIES:
        category = "other"

    taken_at = _extract_exif_date(raw)
    compressed, size_kb = _compress_image(raw)

    gridfs_id = await _store_photo(file.filename or "photo.jpg", compressed)

    photo = MaintenancePhoto(
        log_id=log.id,
        vessel_id=log.vessel_id,
        gridfs_id=gridfs_id,
        original_filename=file.filename or "photo.jpg",
        caption=caption,
        category=category,
        location_tag=location_tag,
        file_size_kb=size_kb,
        taken_at=taken_at,
        uploaded_by=current_user.id,
    )
    await photo.insert()
    return _serialize_photo(photo)


@router.get("/{log_id}/photos/{photo_id}/file")
async def get_photo_file(
    log_id: str,
    photo_id: str,
):
    """Serve photo file — no auth required (ObjectIds are unguessable; standard media-serve pattern)."""
    photo = await MaintenancePhoto.get(photo_id)
    if not photo or str(photo.log_id) != log_id:
        raise HTTPException(status_code=404, detail="Photo not found")
    if not photo.gridfs_id:
        raise HTTPException(status_code=404, detail="No file stored")

    data = await _fetch_photo(photo.gridfs_id)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="image/jpeg",
        headers={
            "Content-Disposition": f'inline; filename="{photo.original_filename}"',
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )


@router.delete("/{log_id}/photos/{photo_id}")
async def delete_photo(
    log_id: str,
    photo_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    photo = await MaintenancePhoto.get(photo_id)
    if not photo or str(photo.log_id) != str(log.id):
        raise HTTPException(status_code=404, detail="Photo not found")

    if photo.gridfs_id:
        await _delete_photo_file(photo.gridfs_id)
    await photo.delete()
    return {"message": "Deleted"}


# ─── T-04: Drills ─────────────────────────────────────────────────────────────

class DrillBody(BaseModel):
    drill_type: str
    drill_date: str        # ISO date string YYYY-MM-DD
    drill_time: Optional[str] = None
    location: Optional[str] = None
    conducted_by: str
    attendees: List[str] = []
    attendee_count: int = 0
    observations: Optional[str] = None
    corrective_actions: Optional[str] = None


def _serialize_drill(d: DrillRecord) -> dict:
    return {
        "id": str(d.id),
        "log_id": str(d.log_id),
        "drill_type": d.drill_type,
        "drill_type_label": DRILL_TYPE_LABELS.get(d.drill_type, d.drill_type),
        "drill_date": d.drill_date.isoformat(),
        "drill_time": d.drill_time,
        "location": d.location,
        "conducted_by": d.conducted_by,
        "attendees": d.attendees or [],
        "attendee_count": d.attendee_count,
        "observations": d.observations,
        "corrective_actions": d.corrective_actions,
        "created_at": d.created_at.isoformat(),
    }


@router.get("/{log_id}/drills")
async def list_drills(
    log_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    drills = await DrillRecord.find(
        DrillRecord.log_id == log.id
    ).sort(DrillRecord.drill_date).to_list()
    return [_serialize_drill(d) for d in drills]


@router.post("/{log_id}/drills")
async def create_drill(
    log_id: str,
    body: DrillBody,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    drill = DrillRecord(
        log_id=log.id,
        vessel_id=log.vessel_id,
        drill_type=body.drill_type,
        drill_date=date.fromisoformat(body.drill_date),
        drill_time=body.drill_time,
        location=body.location,
        conducted_by=body.conducted_by,
        attendees=body.attendees,
        attendee_count=len(body.attendees) if body.attendees else body.attendee_count,
        observations=body.observations,
        corrective_actions=body.corrective_actions,
    )
    await drill.insert()
    return _serialize_drill(drill)


@router.put("/{log_id}/drills/{drill_id}")
async def update_drill(
    log_id: str,
    drill_id: str,
    body: DrillBody,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    drill = await DrillRecord.get(drill_id)
    if not drill or str(drill.log_id) != str(log.id):
        raise HTTPException(status_code=404, detail="Drill not found")

    drill.drill_type = body.drill_type
    drill.drill_date = date.fromisoformat(body.drill_date)
    drill.drill_time = body.drill_time
    drill.location = body.location
    drill.conducted_by = body.conducted_by
    drill.attendees = body.attendees
    drill.attendee_count = len(body.attendees) if body.attendees else body.attendee_count
    drill.observations = body.observations
    drill.corrective_actions = body.corrective_actions
    drill.updated_at = datetime.utcnow()
    await drill.save()
    return _serialize_drill(drill)


@router.delete("/{log_id}/drills/{drill_id}")
async def delete_drill(
    log_id: str,
    drill_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    drill = await DrillRecord.get(drill_id)
    if not drill or str(drill.log_id) != str(log.id):
        raise HTTPException(status_code=404, detail="Drill not found")

    await drill.delete()
    return {"message": "Deleted"}


# ─── T-05: ME Performance ─────────────────────────────────────────────────────

class MEPerformanceBody(BaseModel):
    record_date: str
    oil_type: Optional[str] = None
    tbn_nominal: Optional[float] = None
    engine_run_hours: Optional[float] = None
    shaft_power_kw: Optional[float] = None
    speed_rpm: Optional[float] = None
    fuel_index: Optional[float] = None
    acc_g_kwhxs: Optional[float] = None
    min_feed_rate_g_kwh: Optional[float] = None
    sulphur_content_pct: Optional[float] = None
    cylinders: list = []
    notes: Optional[str] = None
    completed_by: str = ""


def _serialize_me(m: MEPerformanceRecord) -> dict:
    # Compute specific feed rate if possible
    sfr = None
    if m.acc_g_kwhxs is not None and m.sulphur_content_pct is not None:
        sfr = round(m.acc_g_kwhxs * m.sulphur_content_pct, 3)

    return {
        "id": str(m.id),
        "log_id": str(m.log_id),
        "record_date": m.record_date.isoformat(),
        "oil_type": m.oil_type,
        "tbn_nominal": m.tbn_nominal,
        "engine_run_hours": m.engine_run_hours,
        "shaft_power_kw": m.shaft_power_kw,
        "speed_rpm": m.speed_rpm,
        "fuel_index": m.fuel_index,
        "acc_g_kwhxs": m.acc_g_kwhxs,
        "min_feed_rate_g_kwh": m.min_feed_rate_g_kwh,
        "sulphur_content_pct": m.sulphur_content_pct,
        "specific_feed_rate_g_kwh": sfr,
        "cylinders": [c.model_dump() for c in m.cylinders],
        "notes": m.notes,
        "completed_by": m.completed_by,
        "created_at": m.created_at.isoformat(),
    }


@router.get("/{log_id}/me-performance")
async def get_me_performance(
    log_id: str,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    rec = await MEPerformanceRecord.find_one(MEPerformanceRecord.log_id == log.id)
    if rec is None:
        # Return blank record with default cylinder rows so frontend can render
        return {
            "id": None,
            "log_id": log_id,
            "record_date": date.today().isoformat(),
            "oil_type": None,
            "tbn_nominal": None,
            "engine_run_hours": None,
            "shaft_power_kw": None,
            "speed_rpm": None,
            "fuel_index": None,
            "acc_g_kwhxs": None,
            "min_feed_rate_g_kwh": None,
            "sulphur_content_pct": None,
            "specific_feed_rate_g_kwh": None,
            "cylinders": [
                {"cylinder_number": i, "tbn_residual": None, "fe_ppm": None,
                 "drain_oil_bn": None, "liner_wear_mm": None, "remarks": None}
                for i in range(1, 7)
            ],
            "notes": None,
            "completed_by": "",
        }

    return _serialize_me(rec)


@router.post("/{log_id}/me-performance")
async def upsert_me_performance(
    log_id: str,
    body: MEPerformanceBody,
    current_user: User = Depends(get_current_user),
):
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    _check_log_access(log, current_user)

    cylinders = [CylinderData(**c) for c in body.cylinders]
    now = datetime.utcnow()

    rec = await MEPerformanceRecord.find_one(MEPerformanceRecord.log_id == log.id)
    if rec is None:
        rec = MEPerformanceRecord(
            log_id=log.id,
            vessel_id=log.vessel_id,
            record_date=date.fromisoformat(body.record_date),
            oil_type=body.oil_type,
            tbn_nominal=body.tbn_nominal,
            engine_run_hours=body.engine_run_hours,
            shaft_power_kw=body.shaft_power_kw,
            speed_rpm=body.speed_rpm,
            fuel_index=body.fuel_index,
            acc_g_kwhxs=body.acc_g_kwhxs,
            min_feed_rate_g_kwh=body.min_feed_rate_g_kwh,
            sulphur_content_pct=body.sulphur_content_pct,
            cylinders=cylinders,
            notes=body.notes,
            completed_by=body.completed_by,
            updated_at=now,
        )
        await rec.insert()
    else:
        rec.record_date = date.fromisoformat(body.record_date)
        rec.oil_type = body.oil_type
        rec.tbn_nominal = body.tbn_nominal
        rec.engine_run_hours = body.engine_run_hours
        rec.shaft_power_kw = body.shaft_power_kw
        rec.speed_rpm = body.speed_rpm
        rec.fuel_index = body.fuel_index
        rec.acc_g_kwhxs = body.acc_g_kwhxs
        rec.min_feed_rate_g_kwh = body.min_feed_rate_g_kwh
        rec.sulphur_content_pct = body.sulphur_content_pct
        rec.cylinders = cylinders
        rec.notes = body.notes
        rec.completed_by = body.completed_by
        rec.updated_at = now
        await rec.save()

    # Run anomaly detection and update log
    anomalies = await detect_anomalies(log_id)
    log.anomalies = anomalies
    await log.save()

    return _serialize_me(rec)
