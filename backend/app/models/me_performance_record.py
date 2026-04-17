from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import List, Optional


class CylinderData(BaseModel):
    cylinder_number: int
    tbn_residual: Optional[float] = None    # scrape-down TBN residual; alert if < 40
    fe_ppm: Optional[float] = None          # Fe ppm; warn > 200, critical > 800
    drain_oil_bn: Optional[float] = None    # drain oil BN sample; alert if < 15
    liner_wear_mm: Optional[float] = None
    remarks: Optional[str] = None


class MEPerformanceRecord(Document):
    log_id: PydanticObjectId
    vessel_id: PydanticObjectId
    record_date: date

    # Oil & lube system
    oil_type: Optional[str] = None           # e.g. "TARO ULTRA 140"
    tbn_nominal: Optional[float] = None      # BN grade of cylinder oil, e.g. 140

    # Engine parameters
    engine_run_hours: Optional[float] = None
    shaft_power_kw: Optional[float] = None
    speed_rpm: Optional[float] = None
    fuel_index: Optional[float] = None
    acc_g_kwhxs: Optional[float] = None      # ACC factor e.g. 0.28 g/kWh×S%
    min_feed_rate_g_kwh: Optional[float] = None
    sulphur_content_pct: Optional[float] = None
    specific_feed_rate_g_kwh: Optional[float] = None   # calculated: ACC × sulphur

    # Per-cylinder data
    cylinders: List[CylinderData] = []

    notes: Optional[str] = None
    completed_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "me_performance_records"
        indexes = [
            [("log_id", 1)],
            [("vessel_id", 1), ("record_date", -1)],
        ]
