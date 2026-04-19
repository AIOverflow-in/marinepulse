import json
from datetime import date
from typing import Any, Dict
from beanie import PydanticObjectId

from app.models.vessel import Vessel
from app.models.inspection import Inspection
from app.models.inspection_score import InspectionScore
from app.models.inspection_request import InspectionRequest
from app.models.checklist_item import ChecklistItem
from app.models.vessel_weekly_log import VesselWeeklyLog
from app.models.safety_check_record import SafetyCheckRecord
from app.models.maintenance_log_record import MaintenanceLogRecord
from app.models.maintenance_photo import MaintenancePhoto
from app.models.drill_record import DrillRecord
from app.models.me_performance_record import MEPerformanceRecord


async def _find_vessel_by_name(name: str):
    """Case-insensitive partial match on vessel name."""
    vessels = await Vessel.find_all().to_list()
    name_lower = name.lower()
    matches = [v for v in vessels if name_lower in v.name.lower()]
    return matches[0] if matches else None


async def handle_get_vessel_inspection_summary(args: Dict[str, Any]) -> str:
    vessel_name = args.get("vessel_name", "")
    limit = min(int(args.get("limit", 1)), 5)

    vessel = await _find_vessel_by_name(vessel_name)
    if not vessel:
        return json.dumps({"error": f"No vessel found matching '{vessel_name}'"})

    inspections = await Inspection.find(
        Inspection.vessel_id == vessel.id,
        Inspection.vhi_score != None,
    ).sort(-Inspection.inspection_date).limit(limit).to_list()

    result = {
        "vessel_name": vessel.name,
        "vessel_type": vessel.vessel_type,
        "imo_number": vessel.imo_number,
        "inspections": [
            {
                "date": i.inspection_date.strftime("%Y-%m-%d"),
                "port": i.port,
                "vhi_score": i.vhi_score,
                "vhi_grade": i.vhi_grade,
                "status": i.status,
                "deficiency_count": i.deficiency_count,
                "critical_deficiency_count": i.critical_deficiency_count,
            }
            for i in inspections
        ],
    }
    return json.dumps(result)


async def handle_get_fleet_vhi_ranking(args: Dict[str, Any]) -> str:
    order = args.get("order", "desc")

    inspections = await Inspection.find(
        Inspection.vhi_score != None,
        {"status": {"$in": ["reviewed", "submitted"]}},
    ).sort(-Inspection.inspection_date).to_list()

    vessel_latest: Dict[str, dict] = {}
    for i in inspections:
        vid = str(i.vessel_id)
        if vid not in vessel_latest:
            vessel_latest[vid] = {
                "vessel_id": vid,
                "vhi_score": i.vhi_score,
                "vhi_grade": i.vhi_grade,
                "date": i.inspection_date.strftime("%Y-%m-%d"),
                "deficiency_count": i.deficiency_count,
            }

    vessels = await Vessel.find_all().to_list()
    vessel_name_map = {str(v.id): v.name for v in vessels}

    ranked = [
        {**v, "vessel_name": vessel_name_map.get(v["vessel_id"], "Unknown")}
        for v in vessel_latest.values()
    ]
    ranked.sort(key=lambda x: x["vhi_score"], reverse=(order == "desc"))

    fleet_avg = round(sum(v["vhi_score"] for v in ranked) / len(ranked), 1) if ranked else 0

    return json.dumps({"fleet_average": fleet_avg, "ranking": ranked})


async def handle_get_recurring_deficiencies(args: Dict[str, Any]) -> str:
    vessel_name = args.get("vessel_name")
    category = args.get("category")
    top_n = min(int(args.get("top_n", 10)), 20)

    insp_filter = {"status": {"$in": ["reviewed", "submitted"]}}
    if vessel_name:
        vessel = await _find_vessel_by_name(vessel_name)
        if vessel:
            insp_filter["vessel_id"] = vessel.id

    inspections = await Inspection.find(insp_filter).to_list()
    inspection_ids = [i.id for i in inspections]

    if not inspection_ids:
        return json.dumps([])

    score_filter = {
        "inspection_id": {"$in": inspection_ids},
        "is_deficiency": True,
    }
    if category:
        score_filter["category"] = {"$regex": category, "$options": "i"}

    pipeline = [
        {"$match": score_filter},
        {
            "$group": {
                "_id": "$checklist_item_id",
                "deficiency_count": {"$sum": 1},
                "category": {"$first": "$category"},
                "avg_score": {"$avg": "$score"},
            }
        },
        {"$sort": {"deficiency_count": -1}},
        {"$limit": top_n},
    ]

    results = await InspectionScore.aggregate(pipeline).to_list()
    enriched = []
    for r in results:
        item = await ChecklistItem.get(r["_id"])
        enriched.append({
            "item_name": item.item_name if item else "Unknown",
            "category": r["category"],
            "deficiency_count": r["deficiency_count"],
            "avg_score": round(r["avg_score"], 1),
            "failure_rate_pct": round((r["deficiency_count"] / len(inspections)) * 100, 1),
        })

    return json.dumps(enriched)


async def handle_get_category_performance(args: Dict[str, Any]) -> str:
    vessel_name = args.get("vessel_name")

    insp_filter = {"status": {"$in": ["reviewed", "submitted"]}}
    if vessel_name:
        vessel = await _find_vessel_by_name(vessel_name)
        if vessel:
            insp_filter["vessel_id"] = vessel.id

    inspections = await Inspection.find(insp_filter).to_list()
    inspection_ids = [i.id for i in inspections]

    if not inspection_ids:
        return json.dumps([])

    pipeline = [
        {
            "$match": {
                "inspection_id": {"$in": inspection_ids},
                "score": {"$ne": None},
            }
        },
        {
            "$group": {
                "_id": "$category",
                "avg_score": {"$avg": "$score"},
                "deficiency_count": {"$sum": {"$cond": ["$is_deficiency", 1, 0]}},
            }
        },
        {"$sort": {"avg_score": -1}},
    ]

    results = await InspectionScore.aggregate(pipeline).to_list()
    return json.dumps([
        {
            "category": r["_id"],
            "avg_score": round(r["avg_score"], 1),
            "deficiency_count": r["deficiency_count"],
        }
        for r in results
    ])


async def handle_compare_vessels(args: Dict[str, Any]) -> str:
    vessel_names = args.get("vessel_names", [])
    result = []
    for name in vessel_names:
        vessel = await _find_vessel_by_name(name)
        if not vessel:
            result.append({"vessel_name": name, "error": "Not found"})
            continue

        latest = await Inspection.find(
            Inspection.vessel_id == vessel.id,
            Inspection.vhi_score != None,
        ).sort(-Inspection.inspection_date).first_or_none()

        result.append({
            "vessel_name": vessel.name,
            "vessel_type": vessel.vessel_type,
            "vhi_score": latest.vhi_score if latest else None,
            "vhi_grade": latest.vhi_grade if latest else None,
            "deficiency_count": latest.deficiency_count if latest else None,
            "last_inspection": latest.inspection_date.strftime("%Y-%m-%d") if latest else None,
        })

    return json.dumps(result)


async def handle_get_pending_inspections(args: Dict[str, Any]) -> str:
    status = args.get("status", "all")
    if status == "all":
        statuses = ["pending", "in_progress", "submitted"]
    else:
        statuses = [status]

    inspections = await Inspection.find({"status": {"$in": statuses}}).sort(-Inspection.inspection_date).to_list()
    vessels = await Vessel.find_all().to_list()
    vessel_map = {str(v.id): v.name for v in vessels}

    return json.dumps([
        {
            "inspection_id": str(i.id),
            "vessel_name": vessel_map.get(str(i.vessel_id), "Unknown"),
            "status": i.status,
            "port": i.port,
            "inspection_date": i.inspection_date.strftime("%Y-%m-%d"),
            "scored_items": i.scored_items,
            "total_items": i.total_items,
        }
        for i in inspections
    ])


# ── AuditVault AI tool helpers ────────────────────────────────────────────────

def _cylinder_diagnosis(fe: float | None, tbn: float | None) -> str:
    """Mirror the 6-rule diagnostic engine used in log_analyzer.py."""
    if fe is None or tbn is None:
        return "Insufficient data"
    if fe >= 800:
        return "CRITICAL — Fe very high, act immediately"
    if fe >= 500 and tbn < 20:
        return "Cold Corrosion risk — increase CLO feed rate or switch to higher BN oil"
    if fe >= 200:
        return "CAUTION — Fe elevated, monitor closely"
    if fe < 200 and tbn > 40:
        return "Over-lubrication risk — consider decreasing CLO feed rate"
    if fe < 200 and tbn < 20:
        return "Low TBN / acid neutralisation risk — check CLO dosing"
    return "Normal"


async def _find_log(vessel: Vessel, week_number: int | None, year: int | None) -> VesselWeeklyLog | None:
    filters = [VesselWeeklyLog.vessel_id == vessel.id]
    if year:
        filters.append(VesselWeeklyLog.year == year)
    if week_number:
        filters.append(VesselWeeklyLog.week_number == week_number)
    return await VesselWeeklyLog.find(*filters).sort(-VesselWeeklyLog.created_at).first_or_none()


async def handle_get_vessel_weekly_logs(args: Dict[str, Any]) -> str:
    vessel_name = args.get("vessel_name", "")
    limit = min(int(args.get("limit", 5)), 10)

    vessel = await _find_vessel_by_name(vessel_name)
    if not vessel:
        return json.dumps({"error": f"No vessel found matching '{vessel_name}'"})

    logs = await VesselWeeklyLog.find(
        VesselWeeklyLog.vessel_id == vessel.id,
    ).sort(-VesselWeeklyLog.created_at).limit(limit).to_list()

    result = []
    for log in logs:
        lid = log.id
        safety = await SafetyCheckRecord.find_one(SafetyCheckRecord.log_id == lid)
        maintenance = await MaintenanceLogRecord.find_one(MaintenanceLogRecord.log_id == lid)
        photo_count = await MaintenancePhoto.find(MaintenancePhoto.log_id == lid).count()
        drill_count = await DrillRecord.find(DrillRecord.log_id == lid).count()
        me = await MEPerformanceRecord.find_one(MEPerformanceRecord.log_id == lid)
        result.append({
            "week": log.week_number,
            "year": log.year,
            "status": log.status,
            "anomaly_count": len(log.anomalies),
            "has_safety_checks": safety is not None,
            "has_maintenance_log": maintenance is not None,
            "photo_count": photo_count,
            "drill_count": drill_count,
            "has_me_performance": me is not None,
            "templates_complete": sum([
                safety is not None,
                maintenance is not None,
                photo_count > 0,
                drill_count > 0,
                me is not None,
            ]),
        })

    return json.dumps({"vessel_name": vessel.name, "logs": result})


async def handle_get_weekly_log_detail(args: Dict[str, Any]) -> str:
    vessel_name = args.get("vessel_name", "")
    week_number = args.get("week_number")
    year = args.get("year")

    vessel = await _find_vessel_by_name(vessel_name)
    if not vessel:
        return json.dumps({"error": f"No vessel found matching '{vessel_name}'"})

    log = await _find_log(vessel, week_number, year)
    if not log:
        return json.dumps({"error": f"No weekly log found for {vessel.name} week={week_number} year={year}"})

    lid = log.id
    safety = await SafetyCheckRecord.find_one(SafetyCheckRecord.log_id == lid)
    maintenance = await MaintenanceLogRecord.find_one(MaintenanceLogRecord.log_id == lid)
    photo_count = await MaintenancePhoto.find(MaintenancePhoto.log_id == lid).count()
    drills = await DrillRecord.find(DrillRecord.log_id == lid).to_list()
    me = await MEPerformanceRecord.find_one(MEPerformanceRecord.log_id == lid)

    maintenance_summary = None
    if maintenance:
        all_tasks = maintenance.er_tasks + maintenance.electrical_tasks
        done = sum(1 for t in all_tasks if t.performed or (t.status and t.status in ("complete",)))
        in_prog = sum(1 for t in all_tasks if t.status == "in_progress")
        maintenance_summary = {"total_tasks": len(all_tasks), "completed": done, "in_progress": in_prog}

    detail = {
        "vessel_name": vessel.name,
        "week": log.week_number,
        "year": log.year,
        "status": log.status,
        "anomalies": log.anomalies,
        "ai_report_available": bool(log.ai_report),
        "ai_report_preview": (log.ai_report[:500] + "…") if log.ai_report else None,
        "safety_checks": "complete" if safety else "missing",
        "maintenance_log": maintenance_summary if maintenance else "missing",
        "photos": photo_count,
        "drills": [{"type": d.drill_type_label if hasattr(d, "drill_type_label") else d.drill_type, "date": str(d.drill_date), "attendees": d.attendee_count} for d in drills],
        "me_performance": "recorded" if me else "missing",
    }
    return json.dumps(detail)


async def handle_get_me_performance_data(args: Dict[str, Any]) -> str:
    vessel_name = args.get("vessel_name", "")
    week_number = args.get("week_number")
    year = args.get("year")

    vessel = await _find_vessel_by_name(vessel_name)
    if not vessel:
        return json.dumps({"error": f"No vessel found matching '{vessel_name}'"})

    log = await _find_log(vessel, week_number, year)
    if not log:
        return json.dumps({"error": f"No weekly log found for {vessel.name}"})

    me = await MEPerformanceRecord.find_one(MEPerformanceRecord.log_id == log.id)
    if not me:
        return json.dumps({"error": f"No ME performance record for {vessel.name} week {log.week_number}/{log.year}"})

    cylinders = []
    for c in me.cylinders:
        cylinders.append({
            "cylinder": c.cylinder_number,
            "tbn_residual": c.tbn_residual,
            "fe_ppm": c.fe_ppm,
            "liner_wear_mm": c.liner_wear_mm,
            "diagnosis": _cylinder_diagnosis(c.fe_ppm, c.tbn_residual),
        })

    return json.dumps({
        "vessel_name": vessel.name,
        "week": log.week_number,
        "year": log.year,
        "record_date": str(me.record_date),
        "oil_type": me.oil_type,
        "tbn_nominal": me.tbn_nominal,
        "engine_run_hours": me.engine_run_hours,
        "shaft_power_kw": me.shaft_power_kw,
        "speed_rpm": me.speed_rpm,
        "sulphur_content_pct": me.sulphur_content_pct,
        "cylinders": cylinders,
        "notes": me.notes,
    })


async def handle_get_safety_check_compliance(args: Dict[str, Any]) -> str:
    vessel_name = args.get("vessel_name", "")
    week_number = args.get("week_number")
    year = args.get("year")

    vessel = await _find_vessel_by_name(vessel_name)
    if not vessel:
        return json.dumps({"error": f"No vessel found matching '{vessel_name}'"})

    log = await _find_log(vessel, week_number, year)
    if not log:
        return json.dumps({"error": f"No weekly log found for {vessel.name}"})

    safety = await SafetyCheckRecord.find_one(SafetyCheckRecord.log_id == log.id)
    if not safety:
        return json.dumps({"error": f"No safety check record for {vessel.name} week {log.week_number}/{log.year}"})

    # Weekly: item is "done" if any of w1-w5 ticked
    weekly_done = [i for i in safety.week_items if any([i.w1, i.w2, i.w3, i.w4, i.w5])]
    weekly_missed = [i for i in safety.week_items if not any([i.w1, i.w2, i.w3, i.w4, i.w5])]

    monthly_done = [i for i in safety.monthly_items if i.test_date or i.not_applicable]
    monthly_missed = [i for i in safety.monthly_items if not i.test_date and not i.not_applicable]
    monthly_na = [{"code": i.item_code, "reason": i.na_reason} for i in safety.monthly_items if i.not_applicable]

    quarterly_done = [i for i in safety.quarterly_items if i.test_date or i.not_applicable]
    quarterly_missed = [i for i in safety.quarterly_items if not i.test_date and not i.not_applicable]
    quarterly_na = [{"code": i.item_code, "reason": i.na_reason} for i in safety.quarterly_items if i.not_applicable]

    return json.dumps({
        "vessel_name": vessel.name,
        "week": log.week_number,
        "year": log.year,
        "completed_by": safety.completed_by,
        "position": safety.position,
        "weekly": {
            "total": len(safety.week_items),
            "completed": len(weekly_done),
            "missed": [{"code": i.item_code, "description": i.description} for i in weekly_missed],
        },
        "monthly": {
            "total": len(safety.monthly_items),
            "completed": len(monthly_done),
            "not_applicable": monthly_na,
            "missed": [{"code": i.item_code, "description": i.description} for i in monthly_missed],
        },
        "quarterly": {
            "total": len(safety.quarterly_items),
            "completed": len(quarterly_done),
            "not_applicable": quarterly_na,
            "missed": [{"code": i.item_code, "description": i.description} for i in quarterly_missed],
        },
    })


async def handle_get_overdue_safety_alerts(args: Dict[str, Any]) -> str:
    vessel_name = args.get("vessel_name", "")

    vessel = await _find_vessel_by_name(vessel_name)
    if not vessel:
        return json.dumps({"error": f"No vessel found matching '{vessel_name}'"})

    from app.services.log_analyzer import get_overdue_alerts
    alerts = await get_overdue_alerts(str(vessel.id))

    if not alerts:
        return json.dumps({"vessel_name": vessel.name, "message": "All safety tests up to date", "alerts": []})

    return json.dumps({
        "vessel_name": vessel.name,
        "alert_count": len(alerts),
        "alerts": [
            {
                "item_code": a["item_code"],
                "description": a["description"],
                "frequency": a["frequency"],
                "days_overdue": a["days_overdue"],
                "last_done": a.get("last_done"),
            }
            for a in alerts
        ],
    })


TOOL_HANDLERS = {
    "get_vessel_inspection_summary": handle_get_vessel_inspection_summary,
    "get_fleet_vhi_ranking": handle_get_fleet_vhi_ranking,
    "get_recurring_deficiencies": handle_get_recurring_deficiencies,
    "get_category_performance": handle_get_category_performance,
    "compare_vessels": handle_compare_vessels,
    "get_pending_inspections": handle_get_pending_inspections,
    # AuditVault AI tools
    "get_vessel_weekly_logs": handle_get_vessel_weekly_logs,
    "get_weekly_log_detail": handle_get_weekly_log_detail,
    "get_me_performance_data": handle_get_me_performance_data,
    "get_safety_check_compliance": handle_get_safety_check_compliance,
    "get_overdue_safety_alerts": handle_get_overdue_safety_alerts,
}
