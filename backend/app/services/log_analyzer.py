"""
AuditVault AI — Log Analyzer Service
Provides: anomaly detection, overdue alert engine, weekly AI report generator.
"""
from datetime import date, datetime, timedelta
from typing import List, Optional

from beanie import PydanticObjectId
from openai import AsyncOpenAI

from app.config import settings
from app.models.drill_record import DrillRecord, DRILL_TYPE_LABELS
from app.models.maintenance_log_record import MaintenanceLogRecord
from app.models.maintenance_photo import MaintenancePhoto
from app.models.me_performance_record import MEPerformanceRecord
from app.models.safety_check_record import SafetyCheckRecord
from app.models.vessel_weekly_log import VesselWeeklyLog

_openai = AsyncOpenAI(api_key=settings.openai_api_key)

# ─── Anomaly thresholds ───────────────────────────────────────────────────────
# Source: ME Scrape-Down Excel "Drain oil rec" sheet + GM 2.10.7 A3
TBN_RESIDUAL_WARN = 40.0       # scrape-down TBN residual: warn below this
FE_PPM_CAUTION = 200.0         # Fe ppm: caution above this
FE_PPM_CRITICAL = 800.0        # Fe ppm: critical above this (act immediately)
FE_PPM_COLD_CORROSION = 500.0  # Fe ppm above this + TBN < 20 = cold corrosion
TBN_LOW_WARN = 20.0            # TBN below this = acid neutralization risk
TBN_HIGH_OVER_LUB = 40.0       # TBN above this + Fe < 200 = over-lubrication
DRAIN_OIL_BN_CRITICAL = 15.0   # drain oil BN: critical below this

# Mandatory weekly safety items — item code: description
# Items C, D, E are SOLAS-critical (fire/emergency pumps + FMIV)
MANDATORY_WEEKLY_ITEMS = {
    "C": "Emergency fire pump test run (8 kg/cm2)",
    "D": "Fire pumps test run (8 kg/cm2)",
    "E": "Integrity test of fire main Isolation valve (FMIV)",
}

# ─── Anomaly detection ────────────────────────────────────────────────────────

async def detect_anomalies(log_id: str) -> List[str]:
    """
    Inspect ME performance and safety check records for this log.
    Returns list of alert strings.
    """
    alerts: List[str] = []
    lid = PydanticObjectId(log_id)

    # ── ME performance: 6-rule diagnostic ─────────────────────────────────────
    me = await MEPerformanceRecord.find_one(MEPerformanceRecord.log_id == lid)
    if me:
        for cyl in me.cylinders:
            n = cyl.cylinder_number
            fe = cyl.fe_ppm
            tbn = cyl.tbn_residual

            if fe is not None and fe >= FE_PPM_CRITICAL:
                alerts.append(
                    f"Cylinder {n}: Fe ppm {fe} is CRITICAL (≥ {FE_PPM_CRITICAL}) — act immediately, investigate liner/ring wear"
                )
            elif fe is not None and fe >= FE_PPM_COLD_CORROSION and tbn is not None and tbn < TBN_LOW_WARN:
                alerts.append(
                    f"Cylinder {n}: Cold Corrosion risk — Fe {fe} ppm (high) + TBN residual {tbn} (low) — increase CLO feed rate or switch to higher BN oil"
                )
            elif fe is not None and fe >= FE_PPM_CAUTION:
                alerts.append(
                    f"Cylinder {n}: Fe ppm {fe} is elevated (≥ {FE_PPM_CAUTION}) — monitor closely"
                )
            elif fe is not None and fe < FE_PPM_CAUTION and tbn is not None and tbn > TBN_HIGH_OVER_LUB:
                alerts.append(
                    f"Cylinder {n}: Over-lubrication risk — Fe {fe} ppm (low) + TBN residual {tbn} (high) — consider decreasing CLO feed rate to prevent additive deposits"
                )
            elif fe is not None and fe < FE_PPM_CAUTION and tbn is not None and tbn < TBN_LOW_WARN:
                alerts.append(
                    f"Cylinder {n}: Low TBN residual {tbn} — acid neutralization risk despite normal Fe {fe} ppm — check oil quality and feed rate"
                )

            if tbn is not None and tbn < TBN_RESIDUAL_WARN:
                # Only add if not already covered by a compound rule above
                if not any(f"Cylinder {n}:" in a for a in alerts):
                    alerts.append(
                        f"Cylinder {n}: TBN residual {tbn} is below warning threshold ({TBN_RESIDUAL_WARN})"
                    )

            if cyl.drain_oil_bn is not None and cyl.drain_oil_bn < DRAIN_OIL_BN_CRITICAL:
                alerts.append(
                    f"Cylinder {n}: Drain oil BN {cyl.drain_oil_bn} is critically low (< {DRAIN_OIL_BN_CRITICAL})"
                )

    # ── Safety checks: mandatory SOLAS-critical items ─────────────────────────
    safety = await SafetyCheckRecord.find_one(SafetyCheckRecord.log_id == lid)
    if safety:
        checked_codes = {
            item.item_code
            for item in safety.week_items
            if item.w1 or item.w2 or item.w3 or item.w4 or item.w5
        }
        for code, description in MANDATORY_WEEKLY_ITEMS.items():
            if code not in checked_codes:
                prefix = "FMIV MISSED" if code == "E" else f"Safety item {code} missed"
                alerts.append(f"{prefix}: {description} — not checked this week")

    return alerts


# ─── Overdue alert engine ──────────────────────────────────────────────────────

async def get_overdue_alerts(vessel_id: str, as_of_date: Optional[date] = None) -> List[dict]:
    """
    For each monthly and quarterly safety test item, find the most recent test_date
    across all SafetyCheckRecords for this vessel, and flag those overdue.

    Returns list of dicts: {item_code, description, frequency, last_done, days_overdue}
    """
    if as_of_date is None:
        as_of_date = date.today()

    # Fetch the most recent safety check records for this vessel (last 90 days worth)
    records = await SafetyCheckRecord.find(
        SafetyCheckRecord.vessel_id == PydanticObjectId(vessel_id)
    ).sort(-SafetyCheckRecord.created_at).limit(20).to_list()

    # Build map: item_code → most recent test_date for monthly items
    monthly_last: dict = {}
    quarterly_last: dict = {}

    for rec in records:
        for item in rec.monthly_items:
            if item.not_applicable:
                continue
            if item.test_date:
                key = item.item_code
                if key not in monthly_last or item.test_date > monthly_last[key]["date"]:
                    monthly_last[key] = {"date": item.test_date, "description": item.description}

        for item in rec.quarterly_items:
            if item.not_applicable:
                continue
            if item.test_date:
                key = item.item_code
                if key not in quarterly_last or item.test_date > quarterly_last[key]["date"]:
                    quarterly_last[key] = {"date": item.test_date, "description": item.description}

    alerts = []

    # Monthly: overdue if last test > 30 days ago
    from app.models.safety_check_record import MONTHLY_ITEMS_TEMPLATE
    for tmpl in MONTHLY_ITEMS_TEMPLATE:
        code = tmpl["item_code"]
        entry = monthly_last.get(code)
        if entry is None:
            alerts.append({
                "item_code": code,
                "description": tmpl["description"],
                "frequency": "monthly",
                "last_done": None,
                "days_overdue": 999,
            })
        else:
            delta = (as_of_date - entry["date"]).days
            if delta > 30:
                alerts.append({
                    "item_code": code,
                    "description": tmpl["description"],
                    "frequency": "monthly",
                    "last_done": entry["date"].isoformat(),
                    "days_overdue": delta - 30,
                })

    # Quarterly: overdue if last test > 90 days ago
    from app.models.safety_check_record import QUARTERLY_ITEMS_TEMPLATE
    for tmpl in QUARTERLY_ITEMS_TEMPLATE:
        code = tmpl["item_code"]
        entry = quarterly_last.get(code)
        if entry is None:
            alerts.append({
                "item_code": code,
                "description": tmpl["description"],
                "frequency": "quarterly",
                "last_done": None,
                "days_overdue": 999,
            })
        else:
            delta = (as_of_date - entry["date"]).days
            if delta > 90:
                alerts.append({
                    "item_code": code,
                    "description": tmpl["description"],
                    "frequency": "quarterly",
                    "last_done": entry["date"].isoformat(),
                    "days_overdue": delta - 90,
                })

    alerts.sort(key=lambda x: -x["days_overdue"])
    return alerts


# ─── Weekly AI report generator ───────────────────────────────────────────────

async def generate_weekly_report(log_id: str) -> str:
    """
    Fetch all 5 template records for this log, build a structured context,
    call gpt-5.4 to generate a markdown weekly superintendent report,
    save it to VesselWeeklyLog.ai_report, and return the markdown string.
    """
    log = await VesselWeeklyLog.get(log_id)
    if not log:
        raise ValueError(f"VesselWeeklyLog {log_id} not found")

    lid = PydanticObjectId(log_id)

    safety = await SafetyCheckRecord.find_one(SafetyCheckRecord.log_id == lid)
    maintenance = await MaintenanceLogRecord.find_one(MaintenanceLogRecord.log_id == lid)
    photos = await MaintenancePhoto.find(MaintenancePhoto.log_id == lid).to_list()
    drills = await DrillRecord.find(DrillRecord.log_id == lid).to_list()
    me = await MEPerformanceRecord.find_one(MEPerformanceRecord.log_id == lid)

    # Build structured context JSON
    context: dict = {
        "vessel_name": log.vessel_name,
        "week_number": log.week_number,
        "year": log.year,
    }

    if safety:
        weekly_done = sum(1 for i in safety.week_items if i.w1 or i.w2 or i.w3 or i.w4 or i.w5)
        weekly_total = len(safety.week_items)
        monthly_done = sum(1 for i in safety.monthly_items if i.test_date and not i.not_applicable)
        monthly_applicable = sum(1 for i in safety.monthly_items if not i.not_applicable)
        quarterly_done = sum(1 for i in safety.quarterly_items if i.test_date and not i.not_applicable)
        quarterly_applicable = sum(1 for i in safety.quarterly_items if not i.not_applicable)
        missed_weekly = [i.description for i in safety.week_items
                         if not (i.w1 or i.w2 or i.w3 or i.w4 or i.w5)]
        context["safety_checks"] = {
            "completed_by": safety.completed_by,
            "position": safety.position,
            "weekly_completed": f"{weekly_done}/{weekly_total}",
            "monthly_completed": f"{monthly_done}/{monthly_applicable}",
            "quarterly_completed": f"{quarterly_done}/{quarterly_applicable}",
            "missed_weekly_items": missed_weekly,
        }
    else:
        context["safety_checks"] = None

    if maintenance:
        er_total = len(maintenance.er_tasks)
        er_done = sum(1 for t in maintenance.er_tasks if t.performed)
        el_total = len(maintenance.electrical_tasks)
        el_done = sum(1 for t in maintenance.electrical_tasks if t.performed)
        pending_tasks = (
            [t.description for t in maintenance.er_tasks if not t.performed] +
            [t.description for t in maintenance.electrical_tasks if not t.performed]
        )
        context["maintenance"] = {
            "er_tasks": f"{er_done}/{er_total} performed",
            "electrical_tasks": f"{el_done}/{el_total} performed",
            "notable_er": [t.description for t in maintenance.er_tasks if t.performed][:6],
            "notable_electrical": [t.description for t in maintenance.electrical_tasks if t.performed][:4],
            "pending_tasks": pending_tasks,
        }
    else:
        context["maintenance"] = None

    if photos:
        from collections import Counter
        cats = Counter(p.category for p in photos)
        context["photos"] = {
            "total_count": len(photos),
            "categories": dict(cats),
            "captions": [p.caption for p in photos[:8]],
        }
    else:
        context["photos"] = None

    if drills:
        context["drills"] = [
            {
                "type": DRILL_TYPE_LABELS.get(d.drill_type, d.drill_type),
                "date": d.drill_date.isoformat(),
                "location": d.location,
                "conducted_by": d.conducted_by,
                "attendees": d.attendee_count,
                "observations": d.observations,
            }
            for d in drills
        ]
    else:
        context["drills"] = []

    if me:
        anomalies = await detect_anomalies(log_id)
        cyl_summary = [
            {"cyl": c.cylinder_number, "tbn": c.tbn_residual, "fe_ppm": c.fe_ppm}
            for c in me.cylinders
        ]
        context["engine_performance"] = {
            "oil_type": me.oil_type,
            "tbn_nominal": me.tbn_nominal,
            "engine_hours": me.engine_run_hours,
            "shaft_power_kw": me.shaft_power_kw,
            "rpm": me.speed_rpm,
            "sulphur_pct": me.sulphur_content_pct,
            "cylinders": cyl_summary,
            "anomalies": anomalies,
            "notes": me.notes,
        }
    else:
        context["engine_performance"] = None

    # Build GPT prompt
    import json
    system_prompt = (
        f"You are a Technical Superintendent AI for {log.vessel_name}. "
        "Generate a professional weekly operational summary following maritime SMS reporting standards. "
        "Be concise, factual, and action-oriented. Flag deficiencies clearly. "
        "Output clean markdown with these sections: "
        "## Safety Compliance, ## Maintenance Summary, ## Deficiencies & Pending Actions, "
        "## Drill Record, ## Engine Health, ## AI Recommendations."
    )
    user_prompt = (
        f"Weekly log data for {log.vessel_name}, Week {log.week_number} of {log.year}:\n\n"
        f"```json\n{json.dumps(context, indent=2, default=str)}\n```\n\n"
        "Generate the weekly superintendent report."
    )

    response = await _openai.chat.completions.create(
        model="gpt-5.4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
    )

    report = response.choices[0].message.content or ""

    # Save to VesselWeeklyLog and update anomalies
    anomalies_list = await detect_anomalies(log_id) if me else []
    log.ai_report = report
    log.anomalies = anomalies_list
    await log.save()

    return report


# ─── Compliance calendar ──────────────────────────────────────────────────────

async def get_compliance_calendar(company_id: Optional[str], year: int) -> List[dict]:
    """
    Returns a compliance grid for all vessels in the company for the given year.
    Pass company_id=None to return all companies (consultancy_admin view).
    Each vessel entry has a `weeks` dict: week_number → "complete"|"partial"|"missing"|"future"
    """
    from app.models.vessel_weekly_log import VesselWeeklyLog

    today = date.today()
    current_week = today.isocalendar()[1]
    current_year = today.year

    # Fetch all logs for this company/year
    filters = [VesselWeeklyLog.year == year]
    if company_id:
        filters.append(VesselWeeklyLog.company_id == PydanticObjectId(company_id))
    logs = await VesselWeeklyLog.find(*filters).to_list()

    # Group by vessel
    vessel_logs: dict = {}
    for log in logs:
        vid = str(log.vessel_id)
        vessel_logs.setdefault(vid, {})[log.week_number] = log

    # For each log, compute completion by querying child records
    result = []
    for vessel_id, week_map in vessel_logs.items():
        weeks: dict = {}
        for w in range(1, 53):
            # Future weeks
            if year > current_year or (year == current_year and w > current_week):
                weeks[str(w)] = "future"
                continue

            log = week_map.get(w)
            if not log:
                weeks[str(w)] = "missing"
                continue

            lid = log.id
            checks = [
                await SafetyCheckRecord.find_one(SafetyCheckRecord.log_id == lid),
                await MaintenanceLogRecord.find_one(MaintenanceLogRecord.log_id == lid),
                await MaintenancePhoto.find_one(MaintenancePhoto.log_id == lid),
                await DrillRecord.find_one(DrillRecord.log_id == lid),
                await MEPerformanceRecord.find_one(MEPerformanceRecord.log_id == lid),
            ]
            done = sum(1 for c in checks if c is not None)
            if done == 5:
                weeks[str(w)] = "complete"
            elif done > 0:
                weeks[str(w)] = "partial"
            else:
                weeks[str(w)] = "missing"

        # Get vessel name from first log
        any_log = next(iter(week_map.values()))
        result.append({
            "vessel_id": vessel_id,
            "vessel_name": any_log.vessel_name,
            "weeks": weeks,
        })

    return result
