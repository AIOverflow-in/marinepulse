from beanie import Document, PydanticObjectId
from datetime import datetime
from typing import Optional
from enum import Enum


class VesselType(str, Enum):
    bulk_carrier = "bulk_carrier"
    tanker = "tanker"
    container = "container"
    ro_ro = "ro_ro"
    general_cargo = "general_cargo"


class VesselStatus(str, Enum):
    active = "active"
    inactive = "inactive"
    drydock = "drydock"


class Vessel(Document):
    company_id: PydanticObjectId
    name: str
    imo_number: str
    vessel_type: VesselType
    flag_state: str
    year_built: int
    gross_tonnage: int
    current_port: Optional[str] = None
    status: VesselStatus = VesselStatus.active
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "vessels"
