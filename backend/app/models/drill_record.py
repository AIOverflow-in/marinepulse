from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime, date
from typing import List, Optional

DRILL_TYPES = [
    "fire_drill",
    "abandon_ship_drill",
    "man_overboard_drill",
    "enclosed_space_drill",
    "lsa_routine_check",
    "qs_safety_meeting",
    "lifeboat_drill",
    "medical_drill",
    "oil_spill_drill",
    "emergency_steering_drill",
    "security_drill",
]

DRILL_TYPE_LABELS = {
    "fire_drill": "Fire Drill",
    "abandon_ship_drill": "Abandon Ship Drill",
    "man_overboard_drill": "Man Overboard Drill",
    "enclosed_space_drill": "Enclosed Space Drill",
    "lsa_routine_check": "LSA Routine Check",
    "qs_safety_meeting": "QS & Safety Meeting",
    "lifeboat_drill": "Lifeboat Drill",
    "medical_drill": "Medical / First Aid Drill",
    "oil_spill_drill": "Oil Spill Drill",
    "emergency_steering_drill": "Emergency Steering Drill",
    "security_drill": "Security Drill",
}


class DrillRecord(Document):
    log_id: PydanticObjectId
    vessel_id: PydanticObjectId
    drill_type: str
    drill_date: date
    drill_time: Optional[str] = None      # "HH:MM"
    location: Optional[str] = None        # e.g. "Foam Room", "Galley", "Paint Room"
    conducted_by: str
    attendees: List[str] = []
    attendee_count: int = 0
    observations: Optional[str] = None
    corrective_actions: Optional[str] = None
    photo_ids: List[PydanticObjectId] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "drill_records"
        indexes = [
            [("log_id", 1)],
            [("vessel_id", 1), ("drill_date", -1)],
        ]
