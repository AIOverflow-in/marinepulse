"""
End-to-end seed: creates one complete weekly log for MV Atlantic Star, Week 14 / 2026.
Covers all 5 AuditVault AI templates + realistic synthetic photos + AI report.

Run: cd backend && source venv/bin/activate && \
     MONGODB_URI="mongodb+srv://..." python scripts/seed_e2e_vessel_log.py
"""
import asyncio
import io
import os
import sys
from datetime import date, datetime

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from beanie import init_beanie, PydanticObjectId

from app.models.company import Company
from app.models.user import User
from app.models.vessel import Vessel
from app.models.vessel_weekly_log import VesselWeeklyLog
from app.models.safety_check_record import (
    SafetyCheckRecord, WeeklyCheckItem, PeriodicCheckItem,
    WEEKLY_ITEMS_TEMPLATE, MONTHLY_ITEMS_TEMPLATE, QUARTERLY_ITEMS_TEMPLATE,
)
from app.models.maintenance_log_record import MaintenanceLogRecord, MaintenanceTask
from app.models.maintenance_photo import MaintenancePhoto
from app.models.drill_record import DrillRecord
from app.models.me_performance_record import MEPerformanceRecord, CylinderData
from app.models.inspection_request import InspectionRequest
from app.models.checklist_template import ChecklistTemplate
from app.models.checklist_item import ChecklistItem
from app.models.inspection import Inspection
from app.models.inspection_score import InspectionScore
from app.models.evidence import Evidence
from app.models.chat_session import ChatSession
from app.models.passage_plan_analysis import PassagePlanAnalysis
from app.models.criteria_set import CriteriaSet

MONGODB_URI = os.getenv(
    "MONGODB_URI",
    "mongodb://root:12345@localhost:27017/marinepulse?authSource=admin",
)

WEEK = 14
YEAR = 2026
VESSEL_NAME_TARGET = "MV Atlantic Star"

# ── Synthetic photo generator ─────────────────────────────────────────────────

def make_photo(title: str, subtitle: str, bg: tuple, accent: tuple) -> bytes:
    """
    Generate a realistic-looking maintenance photo JPEG using Pillow.
    Returns compressed JPEG bytes (<200 KB).
    """
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    import random

    W, H = 1200, 900
    img = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(img)

    # ── Background texture: subtle noise ──────────────────────────────────────
    rng = random.Random(hash(title))
    for _ in range(8000):
        x = rng.randint(0, W - 1)
        y = rng.randint(0, H - 1)
        v = rng.randint(-18, 18)
        r = max(0, min(255, bg[0] + v))
        g = max(0, min(255, bg[1] + v))
        b = max(0, min(255, bg[2] + v))
        draw.point((x, y), fill=(r, g, b))

    # ── Simulated panel / surface ─────────────────────────────────────────────
    panel_y = 80
    panel_h = H - 200
    draw.rectangle([(60, panel_y), (W - 60, panel_y + panel_h)],
                   fill=tuple(max(0, c - 15) for c in bg),
                   outline=accent, width=3)

    # ── Grid lines (simulating metallic surface / grating) ───────────────────
    for x in range(80, W - 60, 60):
        draw.line([(x, panel_y + 10), (x, panel_y + panel_h - 10)],
                  fill=tuple(max(0, c - 25) for c in bg), width=1)
    for y in range(panel_y + 20, panel_y + panel_h - 10, 45):
        draw.line([(80, y), (W - 80, y)],
                  fill=tuple(max(0, c - 25) for c in bg), width=1)

    # ── Accent shapes (bolts / fittings) ─────────────────────────────────────
    for bx, by in [(120, 120), (W - 120, 120), (120, H - 180), (W - 120, H - 180),
                   (W // 2, panel_y + 30), (W // 2, panel_y + panel_h - 30)]:
        draw.ellipse([(bx - 12, by - 12), (bx + 12, by + 12)], fill=accent, outline=(30, 30, 30), width=2)
        draw.ellipse([(bx - 5, by - 5), (bx + 5, by + 5)], fill=(40, 40, 40))

    # ── Central feature box ───────────────────────────────────────────────────
    cx, cy = W // 2, H // 2 - 30
    bw, bh = 420, 220
    draw.rectangle([(cx - bw // 2, cy - bh // 2), (cx + bw // 2, cy + bh // 2)],
                   fill=accent, outline=(255, 255, 255), width=3)
    inner_pad = 10
    draw.rectangle([
        (cx - bw // 2 + inner_pad, cy - bh // 2 + inner_pad),
        (cx + bw // 2 - inner_pad, cy + bh // 2 - inner_pad),
    ], outline=(255, 255, 255, 120), width=1)

    # ── Text overlay ─────────────────────────────────────────────────────────
    try:
        font_lg = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
        font_sm = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
        font_xs = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
    except Exception:
        font_lg = font_sm = font_xs = ImageFont.load_default()

    # Title in feature box
    draw.text((cx, cy - 30), title, fill=(255, 255, 255), font=font_lg, anchor="mm")
    draw.text((cx, cy + 20), subtitle, fill=(220, 220, 220), font=font_sm, anchor="mm")

    # Stamp: vessel name + date
    stamp = f"MV Atlantic Star  |  Week {WEEK}/{YEAR}  |  {date.today().strftime('%d %b %Y')}"
    draw.rectangle([(0, H - 54), (W, H)], fill=(10, 10, 30, 200))
    draw.text((W // 2, H - 27), stamp, fill=(200, 210, 240), font=font_xs, anchor="mm")

    # Corner label
    draw.text((20, 20), "MAINTENANCE PHOTO", fill=accent, font=font_xs)

    # ── Slight blur for realism ───────────────────────────────────────────────
    img = img.filter(ImageFilter.GaussianBlur(radius=0.6))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=78, optimize=True)
    return buf.getvalue()


PHOTOS_META = [
    {
        "filename": "mooring_wire_greasing_001.jpg",
        "caption": "Greasing of mooring wires and drums — Main Deck Fwd",
        "category": "mooring_wires",
        "location_tag": "Main Deck Fwd",
        "title": "MOORING WIRE GREASING",
        "subtitle": "All wires greased — satisfactory",
        "bg": (28, 38, 52),
        "accent": (0, 160, 130),
    },
    {
        "filename": "ig_line_derusting_002.jpg",
        "caption": "De-rusting on IG line flanges and valves — Deck IG Line",
        "category": "ig_system",
        "location_tag": "Deck — IG Line",
        "title": "IG LINE DE-RUSTING",
        "subtitle": "Flanges, valves and spool piece treated",
        "bg": (52, 38, 28),
        "accent": (200, 100, 30),
    },
    {
        "filename": "primer_application_003.jpg",
        "caption": "Primer application on de-rusted areas of IG line, flanges and platform",
        "category": "painting",
        "location_tag": "Deck — IG Platform",
        "title": "PRIMER APPLICATION",
        "subtitle": "Red oxide primer — IG line & platform",
        "bg": (55, 30, 30),
        "accent": (200, 50, 50),
    },
    {
        "filename": "nrv_inspection_004.jpg",
        "caption": "Inspection of IG line Non-Return Valve (NRV) — deck forward",
        "category": "ig_system",
        "location_tag": "Fwd Deck — NRV Station",
        "title": "NRV INSPECTION",
        "subtitle": "IG line NRV — clear, no bypass leakage",
        "bg": (30, 45, 55),
        "accent": (50, 160, 210),
    },
    {
        "filename": "deck_cleaning_005.jpg",
        "caption": "Cleaning of main deck, fish plates and walkways — satisfactory",
        "category": "deck_cleaning",
        "location_tag": "Main Deck — Full Length",
        "title": "DECK CLEANING",
        "subtitle": "Fish plates, scuppers & walkways cleared",
        "bg": (30, 50, 38),
        "accent": (60, 180, 90),
    },
]


# ── Main seeder ───────────────────────────────────────────────────────────────

async def run():
    # ── Connect ───────────────────────────────────────────────────────────────
    try:
        client = AsyncIOMotorClient(MONGODB_URI, tlsCAFile=certifi.where())
    except Exception:
        client = AsyncIOMotorClient(MONGODB_URI)

    db_name = MONGODB_URI.split("/")[-1].split("?")[0] or "marinepulse"
    db = client[db_name]

    # Patch app.database._db so generate_weekly_report can call get_database()
    import app.database as _appdb
    _appdb._db = db

    await init_beanie(
        database=db,
        document_models=[
            Company, User, Vessel, InspectionRequest, ChecklistTemplate,
            ChecklistItem, Inspection, InspectionScore, Evidence, ChatSession,
            PassagePlanAnalysis, CriteriaSet,
            VesselWeeklyLog, SafetyCheckRecord, MaintenanceLogRecord,
            MaintenancePhoto, DrillRecord, MEPerformanceRecord,
        ],
    )

    # ── Resolve vessel + admin user ───────────────────────────────────────────
    vessel = await Vessel.find_one(Vessel.name == VESSEL_NAME_TARGET)
    if not vessel:
        print(f"[ERROR] Vessel '{VESSEL_NAME_TARGET}' not found. Run seed.py first.")
        return

    admin = await User.find_one(User.email == "admin@nordicmaritime.com")
    if not admin:
        print("[ERROR] Admin user not found. Run seed.py first.")
        return

    print(f"✓ Vessel: {vessel.name} ({vessel.id})")
    print(f"✓ User:   {admin.email} ({admin.id})")

    # ── Clean up any existing log for this vessel/week ────────────────────────
    existing = await VesselWeeklyLog.find_one(
        VesselWeeklyLog.vessel_id == vessel.id,
        VesselWeeklyLog.week_number == WEEK,
        VesselWeeklyLog.year == YEAR,
    )
    if existing:
        lid = existing.id
        await SafetyCheckRecord.find(SafetyCheckRecord.log_id == lid).delete()
        await MaintenanceLogRecord.find(MaintenanceLogRecord.log_id == lid).delete()
        await DrillRecord.find(DrillRecord.log_id == lid).delete()
        await MEPerformanceRecord.find(MEPerformanceRecord.log_id == lid).delete()
        # delete photos + gridfs files
        photos = await MaintenancePhoto.find(MaintenancePhoto.log_id == lid).to_list()
        bucket = AsyncIOMotorGridFSBucket(db, bucket_name="maintenance_photos")
        for p in photos:
            if p.gridfs_id:
                try:
                    from bson import ObjectId
                    await bucket.delete(ObjectId(p.gridfs_id))
                except Exception:
                    pass
        await MaintenancePhoto.find(MaintenancePhoto.log_id == lid).delete()
        await existing.delete()
        print(f"  Deleted existing log for Week {WEEK}/{YEAR}")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 1 — Weekly Log Container
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[1/7] Creating VesselWeeklyLog …")
    log = VesselWeeklyLog(
        vessel_id=vessel.id,
        company_id=vessel.company_id,
        vessel_name=vessel.name,
        week_number=WEEK,
        year=YEAR,
        created_by=admin.id,
        status="draft",
        anomalies=[],
    )
    await log.insert()
    print(f"      Log ID: {log.id}")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 2 — T-01: Safety System Checks (GM 2.10.7 A3)
    # All 25 weekly items ticked W1, logbook_confirmed=True
    # Monthly L & N marked N/A with reasons (Front Cruiser pattern)
    # Quarterly F & G marked N/A
    # ─────────────────────────────────────────────────────────────────────────
    print("[2/7] Creating SafetyCheckRecord (GM 2.10.7 A3) …")

    na_monthly = {"L": "Emergency generator load test — not applicable (not synchronised to MSB)",
                  "N": "Bulk carrier cargo hold WIA system — not fitted on this tanker"}
    na_quarterly = {"F": "LNG/LPG cargo plant fire detection — not applicable (oil tanker)",
                    "G": "Bulk carrier CO2 line blow-through — not applicable (oil tanker)"}

    weekly_items = [
        WeeklyCheckItem(
            item_code=t["item_code"],
            description=t["description"],
            w1=True,
            initials="2E/ETO",
            logbook_confirmed=True,
            remarks="Tested satisfactory" if t["item_code"] in ("C", "D", "E") else None,
        )
        for t in WEEKLY_ITEMS_TEMPLATE
    ]

    monthly_items = [
        PeriodicCheckItem(
            item_code=t["item_code"],
            description=t["description"],
            test_date=date(2026, 3, 28) if t["item_code"] not in na_monthly else None,
            initials="CE" if t["item_code"] not in na_monthly else None,
            not_applicable=t["item_code"] in na_monthly,
            na_reason=na_monthly.get(t["item_code"]),
        )
        for t in MONTHLY_ITEMS_TEMPLATE
    ]

    quarterly_items = [
        PeriodicCheckItem(
            item_code=t["item_code"],
            description=t["description"],
            test_date=date(2026, 1, 8) if t["item_code"] not in na_quarterly else None,
            initials="CE" if t["item_code"] not in na_quarterly else None,
            not_applicable=t["item_code"] in na_quarterly,
            na_reason=na_quarterly.get(t["item_code"]),
        )
        for t in QUARTERLY_ITEMS_TEMPLATE
    ]

    safety = SafetyCheckRecord(
        log_id=log.id,
        vessel_id=vessel.id,
        completed_by="2nd Engineer & ETO",
        position="AT SEA",
        week_items=weekly_items,
        monthly_items=monthly_items,
        quarterly_items=quarterly_items,
    )
    await safety.insert()
    print(f"      Weekly: {len(weekly_items)} items all W1 ✓  |  Monthly: {len(monthly_items)} (2 N/A)  |  Quarterly: {len(quarterly_items)} (2 N/A)")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 3 — T-02: Maintenance Log (Form 056) — 8 categories
    # ─────────────────────────────────────────────────────────────────────────
    print("[3/7] Creating MaintenanceLogRecord (Form 056 — 8 categories) …")

    er_tasks = [
        # AE tasks
        MaintenanceTask(seq_number=1,  description="A/E monthly performance check taken and recorded — AE 1, AE 2, AE 3", category="ae", performed=True, status="complete", hours_actual=2.0, remarks="All readings satisfactory"),
        MaintenanceTask(seq_number=2,  description="A/E #3 lube oil filter routine completed", category="ae", performed=True, status="complete", hours_actual=1.5),
        MaintenanceTask(seq_number=3,  description="A/E spare fuel valves overhauled and bench tested", category="ae", performed=True, status="complete", hours_actual=3.0),
        # ME tasks
        MaintenanceTask(seq_number=4,  description="M/E pickup sensor inspected and cleaned — satisfactory", category="me", performed=True, status="complete", hours_actual=1.0),
        MaintenanceTask(seq_number=5,  description="M/E shaft earthing slipring and carbon brush inspection and cleaning carried out", category="me", performed=True, status="complete", hours_actual=1.5),
        MaintenanceTask(seq_number=6,  description="Weekly onboard lube oil test completed and recorded", category="me", performed=True, status="complete", hours_actual=0.5),
        # Boiler
        MaintenanceTask(seq_number=7,  description="Boiler water test carried out — pH 10.5, chlorides nil, results normal", category="boiler", performed=True, status="complete", hours_actual=0.5),
        # Deck
        MaintenanceTask(seq_number=8,  description="ER blower flaps and funnel flaps general greasing carried out", category="deck", performed=True, status="complete", hours_actual=1.0),
        MaintenanceTask(seq_number=9,  description="Engine room general cleaning and painting done", category="deck", performed=True, status="complete", hours_actual=4.0),
        # Safety
        MaintenanceTask(seq_number=10, description="Weekly safety routine test and checks carried out — all satisfactory", category="safety", performed=True, status="complete", hours_actual=1.5),
        MaintenanceTask(seq_number=11, description="OWS feed water pump filter routine completed", category="safety", performed=True, status="complete", hours_actual=1.0),
        # BWTS
        MaintenanceTask(seq_number=12, description="BWTS tried out in ballasting mode — system operational", category="bwts", performed=True, status="complete", hours_actual=2.0),
        MaintenanceTask(seq_number=13, description="Sludge pump filter routine done", category="bwts", performed=True, status="complete", hours_actual=0.5),
        # Troubleshoot
        MaintenanceTask(seq_number=14, description="ER ventilation blower remote panel fault — troubleshooting in progress, maker contacted", category="troubleshoot", performed=False, status="in_progress", remarks="Spare part requisitioned — ETA 2 weeks"),
        MaintenanceTask(seq_number=15, description="Fresh water generator overhauled, boxed back and returned to service", category="me", performed=True, status="complete", hours_actual=3.5),
    ]

    electrical_tasks = [
        MaintenanceTask(seq_number=1,  description="AVSS #1 discharge valve Smart Positioner renewed and calibrated", category="electrical", performed=True, status="complete", hours_actual=3.0),
        MaintenanceTask(seq_number=2,  description="Bridge CCTV PC backup UPS battery renewed", category="electrical", performed=True, status="complete", hours_actual=1.0),
        MaintenanceTask(seq_number=3,  description="BWTS electrolyser A1 No.4 negative terminal insulation guide leak rectified", category="electrical", performed=True, status="complete", hours_actual=2.5),
        MaintenanceTask(seq_number=4,  description="Pump room fixed gas detection system alarm strobe light circuit renewed", category="electrical", performed=True, status="complete", hours_actual=1.5),
        MaintenanceTask(seq_number=5,  description="Ships SPECVISION PC troubleshoot in progress — per maker's instruction manual", category="troubleshoot", performed=False, status="in_progress", remarks="Maker's remote support session scheduled for next week"),
        MaintenanceTask(seq_number=6,  description="Monthly motor greasing completed — all locations satisfactory", category="electrical", performed=True, status="complete", hours_actual=2.0),
        MaintenanceTask(seq_number=7,  description="Saturday routines and alarms test carried out — found satisfactory; lifeboat engine tried out on both battery sets", category="electrical", performed=True, status="complete", hours_actual=1.5),
    ]

    maintenance = MaintenanceLogRecord(
        log_id=log.id,
        vessel_id=vessel.id,
        er_tasks=er_tasks,
        electrical_tasks=electrical_tasks,
        completed_by="Chief Engineer — K. Ramachandran",
        reviewed_by="Technical Superintendent",
    )
    await maintenance.insert()
    er_done = sum(1 for t in er_tasks if t.performed)
    el_done = sum(1 for t in electrical_tasks if t.performed)
    print(f"      ER: {er_done}/{len(er_tasks)} performed  |  Electrical: {el_done}/{len(electrical_tasks)} performed  |  2 in-progress troubleshoots")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 4 — T-03: Maintenance Photos (5 synthetic JPEGs via GridFS)
    # ─────────────────────────────────────────────────────────────────────────
    print("[4/7] Generating and uploading 5 synthetic maintenance photos …")
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="maintenance_photos")

    photo_docs = []
    for meta in PHOTOS_META:
        jpeg_bytes = make_photo(meta["title"], meta["subtitle"], meta["bg"], meta["accent"])
        size_kb = len(jpeg_bytes) // 1024
        file_id = await bucket.upload_from_stream(meta["filename"], jpeg_bytes)
        photo = MaintenancePhoto(
            log_id=log.id,
            vessel_id=vessel.id,
            gridfs_id=str(file_id),
            original_filename=meta["filename"],
            caption=meta["caption"],
            category=meta["category"],
            location_tag=meta["location_tag"],
            file_size_kb=size_kb,
            taken_at=datetime(2026, 4, 4, 8, 30),
            uploaded_by=admin.id,
        )
        await photo.insert()
        photo_docs.append(photo)
        print(f"      [{meta['category']:15s}] {meta['filename']}  ({size_kb} KB)")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 5 — T-04: Drill Records (4 drills + 1 safety meeting)
    # ─────────────────────────────────────────────────────────────────────────
    print("[5/7] Creating DrillRecords …")

    drills_data = [
        {
            "drill_type": "fire_drill",
            "drill_date": date(2026, 4, 3),
            "drill_time": "10:00",
            "location": "General Muster Station",
            "conducted_by": "Master — Capt. V. Sharma",
            "attendees": ["Chief Officer", "2nd Officer", "3rd Officer", "Bosun", "AB-1", "AB-2", "AB-3", "Pumpman", "Electrician", "Cook", "Cadet"],
            "observations": "All crew mustered within 4 minutes. Lifebuoy throw demonstrated. Fire hose pressure checked at 8 kg/cm².",
            "corrective_actions": None,
        },
        {
            "drill_type": "fire_drill",
            "drill_date": date(2026, 4, 3),
            "drill_time": "10:45",
            "location": "Foam Room",
            "conducted_by": "Chief Officer",
            "attendees": ["2nd Officer", "Bosun", "AB-1", "AB-2", "Pumpman"],
            "observations": "Fixed foam system checked. All connections satisfactory. Foam concentrate level verified.",
            "corrective_actions": "Foam line flange gasket showing minor seepage — to be renewed during next port call.",
        },
        {
            "drill_type": "fire_drill",
            "drill_date": date(2026, 4, 3),
            "drill_time": "11:15",
            "location": "Galley",
            "conducted_by": "Chief Officer",
            "attendees": ["Cook", "2nd Officer", "3rd Officer", "AB-2"],
            "observations": "CO2 fixed system activation procedure rehearsed. Galley fire blanket and dry powder extinguisher inspected and confirmed serviceable.",
            "corrective_actions": None,
        },
        {
            "drill_type": "man_overboard_drill",
            "drill_date": date(2026, 4, 5),
            "drill_time": "14:00",
            "location": "Bridge / Main Deck",
            "conducted_by": "Master — Capt. V. Sharma",
            "attendees": ["All officers", "AB-1", "AB-2", "Bosun"],
            "observations": "MOB manoeuvre executed — Williamson turn. Rescue boat crew donned immersion suits within 5 min. Oscar buoy deployed. Recovery exercise completed satisfactorily.",
            "corrective_actions": "Rescue boat davit wire to be greased at next opportunity.",
        },
        {
            "drill_type": "qs_safety_meeting",
            "drill_date": date(2026, 4, 1),
            "drill_time": "09:00",
            "location": "Messroom",
            "conducted_by": "Master — Capt. V. Sharma",
            "attendees": ["Chief Engineer", "Chief Officer", "2nd Engineer", "2nd Officer", "ETO", "3rd Officer", "Bosun"],
            "observations": "Discussed results of Week 13 near-miss incident (slippery deck plate fwd). ToolBox talk on safe access to cargo pump room. PPE compliance reinforced.",
            "corrective_actions": "Anti-slip tape to be applied to fwd deck plate — requisition raised.",
        },
    ]

    drill_docs = []
    for d in drills_data:
        drill = DrillRecord(
            log_id=log.id,
            vessel_id=vessel.id,
            drill_type=d["drill_type"],
            drill_date=d["drill_date"],
            drill_time=d["drill_time"],
            location=d["location"],
            conducted_by=d["conducted_by"],
            attendees=d["attendees"],
            attendee_count=len(d["attendees"]),
            observations=d["observations"],
            corrective_actions=d["corrective_actions"],
        )
        await drill.insert()
        drill_docs.append(drill)
        print(f"      {d['drill_type']:25s}  {d['drill_date']}  {len(d['attendees'])} attendees")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 6 — T-05: ME Performance (cylinder data with intentional anomalies)
    # Cyl 4: Fe=620, TBN=17 → Cold Corrosion WARNING
    # Cyl 5: Fe=75, TBN=46  → Over-lubrication INFO
    # Cyl 1–3, 6: normal range
    # ─────────────────────────────────────────────────────────────────────────
    print("[6/7] Creating MEPerformanceRecord (6 cylinders, 2 anomalies) …")

    cylinders = [
        CylinderData(cylinder_number=1, tbn_residual=60, fe_ppm=110, drain_oil_bn=32, remarks="Normal"),
        CylinderData(cylinder_number=2, tbn_residual=58, fe_ppm=97,  drain_oil_bn=30),
        CylinderData(cylinder_number=3, tbn_residual=55, fe_ppm=136, drain_oil_bn=29),
        CylinderData(cylinder_number=4, tbn_residual=17, fe_ppm=620, drain_oil_bn=22, remarks="⚠ Cold corrosion suspected — CLO feed rate to be reviewed"),
        CylinderData(cylinder_number=5, tbn_residual=46, fe_ppm=75,  drain_oil_bn=38, remarks="TBN high relative to Fe — monitor CLO feed"),
        CylinderData(cylinder_number=6, tbn_residual=53, fe_ppm=69,  drain_oil_bn=31),
    ]

    me_record = MEPerformanceRecord(
        log_id=log.id,
        vessel_id=vessel.id,
        record_date=date(2026, 4, 4),
        oil_type="TARO ULTRA 140",
        tbn_nominal=140,
        engine_run_hours=34_575,
        shaft_power_kw=7_821,
        speed_rpm=61,
        fuel_index=69,
        acc_g_kwhxs=0.28,
        min_feed_rate_g_kwh=1.00,
        sulphur_content_pct=2.59,
        specific_feed_rate_g_kwh=round(0.28 * 2.59, 3),
        cylinders=cylinders,
        notes="Vessel @ Sea — Sp. Feed rate maintained at 1.00 gm/KW hr. "
              "Cyl 4 showing elevated Fe — CLO feed rate increased to 1.20 g/kWh pending next scrape-down.",
        completed_by="Chief Engineer — K. Ramachandran",
    )
    await me_record.insert()
    print(f"      TBN residuals: {[c.tbn_residual for c in cylinders]}")
    print(f"      Fe ppm:        {[c.fe_ppm for c in cylinders]}")
    print(f"      Expected anomalies: Cyl 4 Cold Corrosion | Cyl 5 Over-lubrication")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 7 — Run anomaly detection & submit → AI report
    # ─────────────────────────────────────────────────────────────────────────
    print("[7/7] Running anomaly detection + generating AI report …")

    from app.services.log_analyzer import detect_anomalies, generate_weekly_report

    anomalies = await detect_anomalies(str(log.id))
    print(f"\n  Anomalies detected ({len(anomalies)}):")
    for a in anomalies:
        print(f"    ⚠  {a}")

    # Submit the log
    log.status = "submitted"
    log.submitted_by = admin.id
    log.submitted_at = datetime.utcnow()
    log.anomalies = anomalies
    await log.save()

    print("\n  Generating AI weekly superintendent report (GPT-5.4) …")
    try:
        report = await generate_weekly_report(str(log.id))
        preview = report[:300].replace("\n", " ")
        print(f"\n  Report preview: {preview}…")
        print(f"\n  ✅ Report generated ({len(report)} chars)")
    except Exception as e:
        print(f"\n  ⚠ AI report generation failed: {e}")
        print("    (Backend may lack OpenAI connectivity in script context — log is otherwise complete)")

    # ── Final status check ────────────────────────────────────────────────────
    final_log = await VesselWeeklyLog.get(log.id)
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  E2E Seed Complete — {VESSEL_NAME_TARGET} / Week {WEEK}/{YEAR}
╠══════════════════════════════════════════════════════════════╣
║  Log ID:           {str(final_log.id)}
║  Status:           {final_log.status}
║  Safety checks:    25 weekly (all ✓) + 16 monthly + 9 quarterly
║  Maintenance:      15 ER tasks + 7 electrical (2 in-progress)
║  Photos:           5 JPEGs stored in GridFS
║  Drills:           4 drills + 1 QS safety meeting
║  ME cylinders:     6 (Cyl 4: Cold Corrosion | Cyl 5: Over-lub)
║  Anomalies:        {len(anomalies)}
║  AI report:        {'✅ generated' if final_log.ai_report else '⚠ not generated'}
╚══════════════════════════════════════════════════════════════╝
""")
    client.close()


if __name__ == "__main__":
    asyncio.run(run())
