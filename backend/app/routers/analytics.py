from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timedelta
from beanie import PydanticObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.inspection import Inspection
from app.models.inspection_score import InspectionScore
from app.models.vessel import Vessel
from app.models.user import User
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/fleet-vhi")
async def fleet_vhi(
    company_id: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """VHI trend over time, grouped by vessel."""
    start = datetime.fromisoformat(start_date) if start_date else datetime.utcnow() - timedelta(days=548)
    end = datetime.fromisoformat(end_date) if end_date else datetime.utcnow()

    match_filter = {
        "status": {"$in": ["reviewed", "submitted"]},
        "inspection_date": {"$gte": start, "$lte": end},
        "vhi_score": {"$ne": None},
    }
    if company_id:
        match_filter["company_id"] = PydanticObjectId(company_id)

    pipeline = [
        {"$match": match_filter},
        {"$sort": {"inspection_date": 1}},
        {
            "$group": {
                "_id": "$vessel_id",
                "data_points": {
                    "$push": {
                        "date": "$inspection_date",
                        "vhi": "$vhi_score",
                        "grade": "$vhi_grade",
                        "inspection_id": "$_id",
                    }
                },
                "latest_vhi": {"$last": "$vhi_score"},
            }
        },
    ]

    results = await Inspection.aggregate(pipeline).to_list()

    # Enrich with vessel names
    vessel_map = {}
    for r in results:
        vid = r["_id"]
        if vid and str(vid) not in vessel_map:
            v = await Vessel.get(vid)
            vessel_map[str(vid)] = v.name if v else "Unknown"

    return [
        {
            "vessel_id": str(r["_id"]),
            "vessel_name": vessel_map.get(str(r["_id"]), "Unknown"),
            "latest_vhi": r["latest_vhi"],
            "data_points": [
                {
                    "date": dp["date"].isoformat() if hasattr(dp["date"], "isoformat") else str(dp["date"]),
                    "vhi": dp["vhi"],
                    "grade": dp.get("grade"),
                }
                for dp in r["data_points"]
            ],
        }
        for r in results
    ]


@router.get("/vessel-benchmark")
async def vessel_benchmark(
    company_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Latest VHI score per vessel for bar chart comparison."""
    match_filter = {
        "status": {"$in": ["reviewed", "submitted"]},
        "vhi_score": {"$ne": None},
    }
    if company_id:
        match_filter["company_id"] = PydanticObjectId(company_id)

    pipeline = [
        {"$match": match_filter},
        {"$sort": {"inspection_date": -1}},
        {
            "$group": {
                "_id": "$vessel_id",
                "latest_vhi": {"$first": "$vhi_score"},
                "latest_grade": {"$first": "$vhi_grade"},
                "latest_date": {"$first": "$inspection_date"},
                "deficiency_count": {"$first": "$deficiency_count"},
            }
        },
        {"$sort": {"latest_vhi": -1}},
    ]

    results = await Inspection.aggregate(pipeline).to_list()

    vessel_map = {}
    for r in results:
        vid = r["_id"]
        if vid and str(vid) not in vessel_map:
            v = await Vessel.get(vid)
            vessel_map[str(vid)] = v.name if v else "Unknown"

    fleet_avg = (
        sum(r["latest_vhi"] for r in results) / len(results) if results else 0
    )

    return {
        "fleet_average": round(fleet_avg, 1),
        "vessels": [
            {
                "vessel_id": str(r["_id"]),
                "vessel_name": vessel_map.get(str(r["_id"]), "Unknown"),
                "vhi_score": r["latest_vhi"],
                "vhi_grade": r["latest_grade"],
                "deficiency_count": r["deficiency_count"],
                "last_inspection": r["latest_date"].isoformat() if hasattr(r["latest_date"], "isoformat") else str(r["latest_date"]),
            }
            for r in results
        ],
    }


@router.get("/deficiencies")
async def recurring_deficiencies(
    company_id: Optional[str] = Query(None),
    vessel_id: Optional[str] = Query(None),
    top_n: int = Query(10),
    current_user: User = Depends(get_current_user),
):
    """Top recurring deficient checklist items."""
    # Find all submitted/reviewed inspections first
    insp_filter = {"status": {"$in": ["reviewed", "submitted"]}}
    if company_id:
        insp_filter["company_id"] = PydanticObjectId(company_id)
    if vessel_id:
        insp_filter["vessel_id"] = PydanticObjectId(vessel_id)

    inspections = await Inspection.find(insp_filter).to_list()
    inspection_ids = [i.id for i in inspections]

    if not inspection_ids:
        return []

    pipeline = [
        {
            "$match": {
                "inspection_id": {"$in": inspection_ids},
                "is_deficiency": True,
            }
        },
        {
            "$group": {
                "_id": "$checklist_item_id",
                "deficiency_count": {"$sum": 1},
                "category": {"$first": "$category"},
                "avg_score": {"$avg": "$score"},
                "total_appearances": {"$sum": 1},
            }
        },
        {"$sort": {"deficiency_count": -1}},
        {"$limit": top_n},
    ]

    results = await InspectionScore.aggregate(pipeline).to_list()

    from app.models.checklist_item import ChecklistItem
    enriched = []
    for r in results:
        item = await ChecklistItem.get(r["_id"])
        enriched.append({
            "checklist_item_id": str(r["_id"]),
            "item_name": item.item_name if item else "Unknown",
            "category": r["category"],
            "deficiency_count": r["deficiency_count"],
            "avg_score": round(r["avg_score"], 1),
            "failure_rate": round((r["deficiency_count"] / len(inspections)) * 100, 1),
        })

    return enriched


@router.get("/category-performance")
async def category_performance(
    company_id: Optional[str] = Query(None),
    vessel_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Average score per category across fleet or vessel."""
    insp_filter = {"status": {"$in": ["reviewed", "submitted"]}}
    if company_id:
        insp_filter["company_id"] = PydanticObjectId(company_id)
    if vessel_id:
        insp_filter["vessel_id"] = PydanticObjectId(vessel_id)

    inspections = await Inspection.find(insp_filter).to_list()
    inspection_ids = [i.id for i in inspections]

    if not inspection_ids:
        return []

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
                "total_items": {"$sum": 1},
                "deficiency_count": {"$sum": {"$cond": ["$is_deficiency", 1, 0]}},
            }
        },
        {"$sort": {"avg_score": -1}},
    ]

    results = await InspectionScore.aggregate(pipeline).to_list()
    return [
        {
            "category": r["_id"],
            "avg_score": round(r["avg_score"], 1),
            "avg_score_pct": round((r["avg_score"] / 5) * 100, 1),
            "total_items": r["total_items"],
            "deficiency_count": r["deficiency_count"],
        }
        for r in results
    ]


@router.get("/summary")
async def fleet_summary(
    company_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """KPI summary cards for dashboard."""
    insp_filter = {}
    if company_id:
        insp_filter["company_id"] = PydanticObjectId(company_id)

    all_inspections = await Inspection.find(insp_filter).to_list()
    reviewed = [i for i in all_inspections if i.status in ("reviewed", "submitted") and i.vhi_score is not None]

    # Latest VHI per vessel
    vessel_latest = {}
    for i in sorted(reviewed, key=lambda x: x.inspection_date):
        vessel_latest[str(i.vessel_id)] = i.vhi_score

    fleet_avg = round(sum(vessel_latest.values()) / len(vessel_latest), 1) if vessel_latest else 0

    from datetime import date
    now = datetime.utcnow()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month = sum(1 for i in all_inspections if i.inspection_date >= start_of_month)

    open_deficiencies = sum(i.deficiency_count for i in reviewed)

    return {
        "active_vessels": len(vessel_latest),
        "fleet_avg_vhi": fleet_avg,
        "inspections_this_month": this_month,
        "open_deficiencies": open_deficiencies,
        "total_inspections": len(all_inspections),
    }
