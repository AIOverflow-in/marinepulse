from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import List, Optional


class WeeklyCheckItem(BaseModel):
    item_code: str           # "A" – "Y"
    description: str
    w1: bool = False
    w2: bool = False
    w3: bool = False
    w4: bool = False
    w5: bool = False
    initials: Optional[str] = None
    remarks: Optional[str] = None


class PeriodicCheckItem(BaseModel):
    item_code: str           # "A" – "P" (monthly) or "A" – "I" (quarterly)
    description: str
    test_date: Optional[date] = None
    initials: Optional[str] = None
    remarks: Optional[str] = None
    not_applicable: bool = False   # N/A items per vessel (e.g. monthly L, N on Front Cruiser)


class SafetyCheckRecord(Document):
    log_id: PydanticObjectId        # → VesselWeeklyLog
    vessel_id: PydanticObjectId
    completed_by: str               # free-text officer name
    position: str                   # e.g. "AT SEA"
    week_items: List[WeeklyCheckItem] = []
    monthly_items: List[PeriodicCheckItem] = []
    quarterly_items: List[PeriodicCheckItem] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "safety_check_records"
        indexes = [
            [("log_id", 1)],
            [("vessel_id", 1)],
        ]


# ── Hardcoded template matching GM 2.10.7 A3 exactly ────────────────────────

WEEKLY_ITEMS_TEMPLATE = [
    {"item_code": "A", "description": "Lifeboat(s) and Rescue boat engines test run on each battery set (3 mins run - disengage propeller shaft)"},
    {"item_code": "B", "description": "Emergency generator test (By both starting means)"},
    {"item_code": "C", "description": "Emergency fire pump test run (8 kg/cm2)"},
    {"item_code": "D", "description": "Fire pumps test run (8 kg/cm2)"},
    {"item_code": "E", "description": "Integrity test of fire main Isolation valve which isolates machinery spaces from deck and accommodation"},
    {"item_code": "F", "description": "Emergency accumulators / batteries, emergency light"},
    {"item_code": "G", "description": "Inspection of Emergency escapes routes"},
    {"item_code": "H", "description": "Bilge level alarms (Engine Room, Pump Room, void spaces, stores etc.)"},
    {"item_code": "I", "description": "Main engine fuel oil leak alarm"},
    {"item_code": "J", "description": "Aux. Diesel engine's fuel oil leak alarm"},
    {"item_code": "K", "description": "Emergency Generator fuel oil leak alarm (where applicable)"},
    {"item_code": "L", "description": "Fire Detectors / Fire Alarm Testing (3 months cycle)"},
    {"item_code": "M", "description": "Fire doors and watertight doors"},
    {"item_code": "N", "description": "Engineers call alarm"},
    {"item_code": "O", "description": "General & Fire alarm"},
    {"item_code": "P", "description": "Hospital call alarm"},
    {"item_code": "Q", "description": "Dead Man alarm (12min + 3min setting)"},
    {"item_code": "R", "description": "Refrigerated Spaces / Cold Room alarm"},
    {"item_code": "S", "description": "Elevator alarm test & Telephone check"},
    {"item_code": "T", "description": "Low insulation test (MSB / ESB)"},
    {"item_code": "U", "description": "Self-closing devices to double bottom tanks"},
    {"item_code": "V", "description": "Emergency Air compressor test run"},
    {"item_code": "W", "description": "Foam Alarm & Tank Level Check (if applicable)"},
    {"item_code": "X", "description": "Engine room, Pump room Fire dampers test"},
    {"item_code": "Y", "description": "Funnel dampers / Flaps closing device"},
]

MONTHLY_ITEMS_TEMPLATE = [
    {"item_code": "A", "description": "Control / operation of steering gear locally (emergency steering)"},
    {"item_code": "B", "description": "Control / operation of main propulsion plant locally"},
    {"item_code": "C", "description": "OWS, OCM (15ppm) & stop device test/operation & officers familiarisation in retrieving data for 18 months"},
    {"item_code": "D", "description": "OWS – 30 mins recirculation test (Tank to Tank) and to be recorded in ORB & PMS"},
    {"item_code": "E", "description": "ODME tested and officer familiar with ODME operations"},
    {"item_code": "F", "description": "CO2 – alarm & shut off fans (If applicable)"},
    {"item_code": "G", "description": "Foam Pump – test run for free movement & recirculation (if applicable)"},
    {"item_code": "H", "description": "Sludge / Bilge / LO Transfer / Sewage discharge Pump remote Stop (Port & Stbd Sides)"},
    {"item_code": "I", "description": "ER ventilation fans / pump room fans remote shutdown"},
    {"item_code": "J", "description": "Accommodation & other spaces ventilation fans shutdown"},
    {"item_code": "K", "description": "Accommodation & other spaces ventilation fans inlet flaps closing device"},
    {"item_code": "L", "description": "Emergency generator load test for 15 minutes (synchronised with main switchboard where capable)"},
    {"item_code": "M", "description": "Hypermist system – Fire detector & alarm testing & system operation check including FW tank low level alarm"},
    {"item_code": "N", "description": "Bulk Carriers – Cargo Holds Water Ingress Alarm System sensors & Forward Store dewatering system testing"},
    {"item_code": "O", "description": "Sound powered phones with headsets (where applicable) from all locations to bridge"},
    {"item_code": "P", "description": "BNWAS alarm all 3 stages"},
]

QUARTERLY_ITEMS_TEMPLATE = [
    {"item_code": "A", "description": "Quick closing valves and release mechanisms for FO and LO tanks (Ensure No blocking, modifications, disabling)"},
    {"item_code": "B", "description": "Emergency stop main engine from Bridge & ECR"},
    {"item_code": "C", "description": "Boiler Emergency Shut off"},
    {"item_code": "D", "description": "Emergency Shut off – Fuel pumps (From Fire control station & Bridge)"},
    {"item_code": "E", "description": "Emergency bilge suction valves inspection & turning"},
    {"item_code": "F", "description": "Cargo plant fire detection & alarm (Fusible plugs) – (LNG/LPG)"},
    {"item_code": "G", "description": "Bulk Carriers – Cargo Hold CO2 line blow through"},
    {"item_code": "H", "description": "Emergency Generator auto start on Blackout and load test (30 mins; concurrent: Emergency Fire pump run + Emergency steering drill per SOLAS V Reg 26.4)"},
    {"item_code": "I", "description": "Auxiliary engines overspeed trips testing per maker's procedure (AE 1, AE 2, AE 3, AE 4)"},
]


def build_blank_safety_check() -> dict:
    """Return pre-populated blank SafetyCheckRecord data matching GM 2.10.7 A3."""
    return {
        "week_items": [
            {**t, "w1": False, "w2": False, "w3": False, "w4": False, "w5": False,
             "initials": None, "remarks": None}
            for t in WEEKLY_ITEMS_TEMPLATE
        ],
        "monthly_items": [
            {**t, "test_date": None, "initials": None, "remarks": None, "not_applicable": False}
            for t in MONTHLY_ITEMS_TEMPLATE
        ],
        "quarterly_items": [
            {**t, "test_date": None, "initials": None, "remarks": None, "not_applicable": False}
            for t in QUARTERLY_ITEMS_TEMPLATE
        ],
    }
