from beanie import Document, PydanticObjectId
from pydantic import Field
from datetime import datetime
from typing import Optional

PHOTO_CATEGORIES = [
    "mooring_wires",    # greasing / maintenance of mooring wires & drums
    "ig_system",        # IG line, flanges, valves, NRV
    "deck_cleaning",    # main deck, fish plates, walkways
    "engine_room",      # ER equipment and spaces
    "painting",         # primer / painting / anti-rust work
    "structural",       # hull, frames, bulkheads
    "fire_fighting",    # extinguishers, hoses, dampers
    "electrical",       # electrical panels, cables, motors
    "lsa_equipment",    # lifeboats, liferafts, immersion suits
    "other",
]


class MaintenancePhoto(Document):
    log_id: PydanticObjectId
    vessel_id: PydanticObjectId
    gridfs_id: Optional[str] = None
    original_filename: str
    caption: str
    category: str = "other"
    location_tag: Optional[str] = None   # e.g. "Main Deck Fwd"
    file_size_kb: int = 0
    taken_at: Optional[datetime] = None  # from EXIF if available
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    uploaded_by: PydanticObjectId

    class Settings:
        name = "maintenance_photos"
        indexes = [
            [("log_id", 1)],
            [("vessel_id", 1), ("uploaded_at", -1)],
        ]
