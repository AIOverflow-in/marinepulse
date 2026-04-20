export interface User {
  id: string;
  name: string;
  email: string;
  role: "shipping_company" | "consultancy_admin" | "surveyor" | "viewer";
  company_id: string | null;
}

export interface Company {
  id: string;
  name: string;
  code: string;
  contact_email?: string;
}

export interface Vessel {
  id: string;
  company_id: string;
  name: string;
  imo_number: string;
  vessel_type: string;
  flag_state: string;
  year_built: number;
  gross_tonnage: number;
  current_port?: string;
  status: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  version: string;
  total_items: number;
  inspection_type?: string;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  category: string;
  item_code: string;
  item_name: string;
  description?: string;
  weight: 1 | 2 | 3;
  sort_order: number;
}

export interface Inspection {
  id: string;
  vessel_id: string;
  company_id: string;
  surveyor_id?: string;
  template_id: string;
  port?: string;
  inspection_date: string;
  submitted_at?: string;
  reviewed_at?: string;
  status: "draft" | "in_progress" | "submitted" | "reviewed" | "closed";
  vhi_score?: number;
  vhi_grade?: "A" | "B" | "C" | "D" | "F";
  total_items: number;
  scored_items: number;
  deficiency_count: number;
  critical_deficiency_count: number;
  admin_remarks?: string;
  created_at: string;
}

export interface InspectionScore {
  id: string;
  checklist_item_id: string;
  item_name: string;
  category: string;
  assessment_type?: "static" | "dynamic";
  guidance_note?: string;
  weight: number;
  score: number | string | null;  // 0-5, "NS", or null (unscored)
  comment?: string;
  is_deficiency: boolean;
  evidence_urls: string[];
}

export type CriterionPriority = "critical" | "high" | "medium" | "low";

export interface CriterionResult {
  id: string;                       // e.g. "A1"
  present: 0 | 1;
  confidence: "high" | "medium" | "low";
  observation?: string;
  risk?: string;
  reference?: string;
  // enriched by backend serializer
  priority?: CriterionPriority;
  category?: string;                // "A" | "B" | ... | "H"
  category_name?: string;           // "Appraisal" | "Planning" | ...
  label?: string;                   // criterion description
}

export interface CriteriaSet {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  criteria_count: number;
  company_id: string | null;
  created_at: string;
}

export interface CriteriaSetDetail extends CriteriaSet {
  criteria: {
    id: string;
    category: string;
    label: string;
    priority: "critical" | "high" | "medium" | "low";
  }[];
}

export interface PassagePlanAnalysis {
  id: string;
  // voyage metadata
  vessel_name?: string;
  voyage_number?: string;
  from_port?: string;
  to_port?: string;
  voyage_date?: string;
  // file
  filename?: string;
  has_file: boolean;
  vessel_id?: string;
  status: "pending" | "processing" | "complete" | "failed";
  error_message?: string;
  overall_score: number;            // 0–100
  total_criteria: number;           // 80 (or custom set size)
  criteria_met: number;
  critical_gaps: number;
  results: CriterionResult[];
  criteria_set_id?: string;
  created_at: string;
}

export interface AnalyticsFleetVHI {
  vessel_id: string;
  vessel_name: string;
  latest_vhi: number;
  data_points: { date: string; vhi: number; grade: string }[];
}

export interface VesselBenchmark {
  fleet_average: number;
  vessels: {
    vessel_id: string;
    vessel_name: string;
    vhi_score: number;
    vhi_grade: string;
    deficiency_count: number;
    last_inspection: string;
  }[];
}

export interface Deficiency {
  checklist_item_id: string;
  item_name: string;
  category: string;
  deficiency_count: number;
  avg_score: number;
  failure_rate: number;
}

export interface CategoryPerformance {
  category: string;
  avg_score: number;
  avg_score_pct: number;
  total_items: number;
  deficiency_count: number;
}

export interface FleetSummary {
  active_vessels: number;
  fleet_avg_vhi: number;
  inspections_this_month: number;
  open_deficiencies: number;
  total_inspections: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface InspectionRequest {
  id: string;
  vessel_id: string;
  company_id: string;
  port: string;
  inspection_type: string;
  scheduled_date: string;
  due_date?: string;
  status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  assigned_surveyor?: string;
  checklist_template_id?: string;
  notes?: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "shipping_company" | "consultancy_admin" | "surveyor" | "viewer";
  company_id: string | null;
  is_active: boolean;
  avatar_url?: string;
  created_at: string;
}

export interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

// ─── AuditVault AI ────────────────────────────────────────────────────────────

export interface VesselWeeklyLog {
  id: string;
  vessel_id: string;
  vessel_name: string;
  week_number: number;
  year: number;
  status: "draft" | "submitted" | "reviewed";
  ai_report?: string;
  anomalies: string[];
  created_at: string;
  submitted_at?: string;
  // completion summary (computed by GET /{log_id})
  has_safety_checks?: boolean;
  has_maintenance_log?: boolean;
  photo_count?: number;
  drill_count?: number;
  has_me_performance?: boolean;
}

export interface WeeklyCheckItem {
  item_code: string;
  description: string;
  w1: boolean;
  w2: boolean;
  w3: boolean;
  w4: boolean;
  w5: boolean;
  initials?: string;
  remarks?: string;
  logbook_confirmed?: boolean;
}

export interface PeriodicCheckItem {
  item_code: string;
  description: string;
  test_date?: string;   // ISO date string
  initials?: string;
  remarks?: string;
  not_applicable?: boolean;
  na_reason?: string;
}

export interface SafetyCheckRecord {
  id: string | null;
  log_id: string;
  completed_by: string;
  position: string;
  week_items: WeeklyCheckItem[];
  monthly_items: PeriodicCheckItem[];
  quarterly_items: PeriodicCheckItem[];
  created_at?: string;
  updated_at?: string;
}

export type MaintenanceCategory =
  | "ae"
  | "me"
  | "boiler"
  | "deck"
  | "safety"
  | "bwts"
  | "electrical"
  | "troubleshoot"
  | "engine_room";

export type MaintenanceStatus = "complete" | "in_progress" | "deferred" | "pending";

export interface MaintenanceTask {
  seq_number: number;
  description: string;
  category: MaintenanceCategory;
  performed: boolean;
  status?: MaintenanceStatus;
  hours_actual?: number;
  remarks?: string;
}

export interface MaintenanceLogRecord {
  id: string | null;
  log_id: string;
  er_tasks: MaintenanceTask[];
  electrical_tasks: MaintenanceTask[];
  completed_by: string;
  reviewed_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MaintenancePhoto {
  id: string;
  log_id: string;
  original_filename: string;
  caption: string;
  category: string;
  location_tag?: string;
  file_size_kb: number;
  taken_at?: string;
  uploaded_at: string;
  has_file: boolean;
}

export interface DrillRecord {
  id: string;
  log_id: string;
  drill_type: string;
  drill_type_label: string;
  drill_date: string;
  drill_time?: string;
  location?: string;
  conducted_by: string;
  attendees: string[];
  attendee_count: number;
  observations?: string;
  corrective_actions?: string;
  created_at: string;
}

export interface CylinderData {
  cylinder_number: number;
  tbn_residual?: number;
  fe_ppm?: number;
  drain_oil_bn?: number;
  liner_wear_mm?: number;
  remarks?: string;
}

export interface MEPerformanceRecord {
  id: string | null;
  log_id: string;
  record_date: string;
  oil_type?: string;
  tbn_nominal?: number;
  engine_run_hours?: number;
  shaft_power_kw?: number;
  speed_rpm?: number;
  fuel_index?: number;
  acc_g_kwhxs?: number;
  min_feed_rate_g_kwh?: number;
  sulphur_content_pct?: number;
  specific_feed_rate_g_kwh?: number;
  cylinders: CylinderData[];
  notes?: string;
  completed_by: string;
  created_at?: string;
}

export interface OverdueAlert {
  item_code: string;
  description: string;
  frequency: "monthly" | "quarterly";
  last_done?: string;
  days_overdue: number;
}

// ─── Class Status Reports ─────────────────────────────────────────────────────

export interface SurveyItem {
  name: string;
  survey_type: "classification" | "statutory" | "continuous";
  due_date?: string;
  range_start?: string;
  range_end?: string;
  days_overdue?: number;
  days_until_due?: number;
  urgency: "critical" | "high" | "medium" | "low";
}

export interface FindingItem {
  code: string;
  reference?: string;
  description: string;
  finding_type: "condition_of_class" | "statutory" | "additional_info";
  due_date?: string;
  action_items: string[];
  extensions: string[];
  action_item_statuses: boolean[];
}

export interface TaskItem {
  priority: "critical" | "high" | "medium" | "low";
  category: "survey" | "finding" | "compliance" | "maintenance";
  title: string;
  description: string;
  due_date?: string;
  related_code?: string;
  status: "open" | "in_progress" | "closed";
  notes?: string;
  closed_at?: string;
}

export interface ClassStatusReport {
  id: string;
  vessel_name: string;
  imo_number?: string;
  ir_number?: string;
  flag?: string;
  class_notation?: string;
  report_date?: string;
  filename: string;
  has_file: boolean;
  status: "processing" | "complete" | "failed";
  error_message?: string;
  overdue_count: number;
  upcoming_count: number;
  findings_count: number;
  task_count: number;
  created_at: string;
  // full detail (only in GET /{id})
  overdue_surveys?: SurveyItem[];
  upcoming_surveys?: SurveyItem[];
  outstanding_findings?: FindingItem[];
  task_list?: TaskItem[];
  ai_summary?: string;
}
