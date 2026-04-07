import json
from typing import Any, Dict
from beanie import PydanticObjectId

from app.models.vessel import Vessel
from app.models.inspection import Inspection
from app.models.inspection_score import InspectionScore
from app.models.inspection_request import InspectionRequest
from app.models.checklist_item import ChecklistItem


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


TOOL_HANDLERS = {
    "get_vessel_inspection_summary": handle_get_vessel_inspection_summary,
    "get_fleet_vhi_ranking": handle_get_fleet_vhi_ranking,
    "get_recurring_deficiencies": handle_get_recurring_deficiencies,
    "get_category_performance": handle_get_category_performance,
    "compare_vessels": handle_compare_vessels,
    "get_pending_inspections": handle_get_pending_inspections,
}
