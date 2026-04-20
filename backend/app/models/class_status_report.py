from datetime import datetime
from typing import List, Optional

from beanie import Document
from pydantic import BaseModel, Field


class SurveyItem(BaseModel):
    name: str
    survey_type: str                  # "classification" | "statutory" | "continuous"
    due_date: Optional[str] = None    # "YYYY-MM-DD"
    range_start: Optional[str] = None
    range_end: Optional[str] = None
    days_overdue: Optional[int] = None
    days_until_due: Optional[int] = None
    urgency: str = "medium"           # "critical" | "high" | "medium" | "low"


class FindingItem(BaseModel):
    code: str                         # e.g. "G0306", "HA0219"
    reference: Optional[str] = None
    description: str
    finding_type: str                 # "condition_of_class" | "statutory" | "additional_info"
    due_date: Optional[str] = None
    action_items: List[str] = []
    extensions: List[str] = []        # extension date strings
    action_item_statuses: List[bool] = []   # per-action-item completion tracking


class TaskItem(BaseModel):
    priority: str                     # "critical" | "high" | "medium" | "low"
    category: str                     # "survey" | "finding" | "compliance" | "maintenance"
    title: str
    description: str
    due_date: Optional[str] = None
    related_code: Optional[str] = None
    status: str = "open"              # "open" | "in_progress" | "closed"
    notes: Optional[str] = None       # vessel manager notes
    closed_at: Optional[str] = None   # ISO date when task was closed


class ClassStatusReport(Document):
    # Vessel info (extracted from PDF)
    vessel_name: str = ""
    imo_number: Optional[str] = None
    ir_number: Optional[str] = None
    flag: Optional[str] = None
    class_notation: Optional[str] = None
    report_date: Optional[str] = None   # "YYYY-MM-DD"

    # File
    filename: str
    gridfs_id: Optional[str] = None

    # Processing
    status: str = "processing"          # "processing" | "complete" | "failed"
    error_message: Optional[str] = None

    # Auth
    company_id: Optional[str] = None
    uploaded_by: Optional[str] = None

    # Extracted data
    overdue_surveys: List[SurveyItem] = []
    upcoming_surveys: List[SurveyItem] = []
    outstanding_findings: List[FindingItem] = []
    task_list: List[TaskItem] = []
    ai_summary: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "class_status_reports"
        indexes = [
            [("company_id", 1), ("created_at", -1)],
        ]
