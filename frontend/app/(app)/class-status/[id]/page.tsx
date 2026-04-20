"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Ship,
  Download,
  Clock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  CheckSquare2,
  Square,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ClassStatusReport, SurveyItem, FindingItem, TaskItem } from "@/types";

// ─── Design tokens ────────────────────────────────────────────────────────────

const PRIORITY_LEFT: Record<string, string> = {
  critical: "border-l-red-400",
  high: "border-l-orange-400",
  medium: "border-l-amber-400",
  low: "border-l-blue-400",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border border-red-200",
  high: "bg-orange-100 text-orange-700 border border-orange-200",
  medium: "bg-amber-100 text-amber-700 border border-amber-200",
  low: "bg-slate-100 text-slate-600 border border-slate-200",
};

const STATUS_ACTIVE: Record<string, string> = {
  open: "bg-slate-200 text-slate-700",
  in_progress: "bg-amber-100 text-amber-700 border border-amber-200",
  closed: "bg-emerald-100 text-emerald-700 border border-emerald-200",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

const URGENCY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border border-red-200",
  high: "bg-orange-100 text-orange-700 border border-orange-200",
  medium: "bg-amber-100 text-amber-700 border border-amber-200",
  low: "bg-slate-100 text-slate-600 border border-slate-200",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${URGENCY_BADGE[urgency] ?? URGENCY_BADGE.low}`}>
      {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
    </span>
  );
}

function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label ?? "Progress"}</span>
        <span className={`font-semibold ${pct === 100 ? "text-emerald-600" : "text-slate-700"}`}>
          {done} / {total}{pct === 100 ? " ✓ Complete" : ` (${pct}%)`}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SurveyTable({ title, items, emptyMsg }: { title: string; items: SurveyItem[]; emptyMsg: string }) {
  if (items.length === 0) return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      <div className="flex items-center gap-2 py-5 px-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {emptyMsg}
      </div>
    </div>
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        {title} <span className="text-slate-400 font-normal">({items.length})</span>
      </h3>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Survey</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due / Window</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Urgency</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 text-slate-800 font-medium">{item.name}</td>
                <td className="px-4 py-3 text-slate-500 capitalize">{item.survey_type}</td>
                <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                  {item.due_date ?? (item.range_start && item.range_end ? `${item.range_start} → ${item.range_end}` : "—")}
                </td>
                <td className="px-4 py-3 text-xs font-medium">
                  {item.days_overdue != null
                    ? <span className="text-red-600">{item.days_overdue}d overdue</span>
                    : item.days_until_due != null
                      ? <span className="text-slate-500">{item.days_until_due}d away</span>
                      : "—"}
                </td>
                <td className="px-4 py-3"><UrgencyBadge urgency={item.urgency} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FindingRow({
  finding,
  findingIndex,
  reportId,
  onUpdate,
}: {
  finding: FindingItem;
  findingIndex: number;
  reportId: string;
  onUpdate: (fi: number, statuses: boolean[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statuses = finding.action_item_statuses ?? [];
  const doneCount = statuses.filter(Boolean).length;
  const totalCount = finding.action_items.length;

  const toggleAction = async (itemIndex: number) => {
    const newStatuses = [...statuses];
    while (newStatuses.length < totalCount) newStatuses.push(false);
    newStatuses[itemIndex] = !newStatuses[itemIndex];
    onUpdate(findingIndex, newStatuses);
    try {
      await api.patch(
        `/api/class-status-reports/${reportId}/findings/${findingIndex}/action-items/${itemIndex}`,
        { completed: newStatuses[itemIndex] }
      );
    } catch {
      onUpdate(findingIndex, statuses);
    }
  };

  const findingTypeBadge =
    finding.finding_type === "condition_of_class"
      ? "bg-orange-100 text-orange-700 border border-orange-200"
      : finding.finding_type === "statutory"
        ? "bg-blue-100 text-blue-700 border border-blue-200"
        : "bg-slate-100 text-slate-600 border border-slate-200";

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}

        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
          {finding.code}
        </span>

        <span className="text-slate-800 text-sm font-medium flex-1 truncate">{finding.description}</span>

        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${findingTypeBadge}`}>
          {finding.finding_type.replace(/_/g, " ")}
        </span>

        {totalCount > 0 && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
            doneCount === totalCount ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}>
            {doneCount}/{totalCount} done
          </span>
        )}

        {finding.due_date && (
          <span className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" /> {finding.due_date}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-slate-50/60 space-y-4">
          {finding.reference && (
            <p className="text-xs text-slate-500">
              Reference: <span className="text-slate-700 font-medium">{finding.reference}</span>
            </p>
          )}

          {finding.action_items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Required Actions
              </p>
              <div className="space-y-2">
                {finding.action_items.map((action, ai) => {
                  const done = statuses[ai] === true;
                  return (
                    <button
                      key={ai}
                      onClick={() => toggleAction(ai)}
                      className="w-full flex items-start gap-2.5 text-left group rounded-lg p-2 hover:bg-white transition-colors"
                    >
                      {done
                        ? <CheckSquare2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        : <Square className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5 group-hover:text-slate-500 transition-colors" />}
                      <span className={`text-sm leading-relaxed transition-colors ${done ? "line-through text-slate-400" : "text-slate-700"}`}>
                        {action}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {finding.extensions.length > 0 && (
            <p className="text-xs text-slate-500">
              Extensions: <span className="text-slate-700 font-mono">{finding.extensions.join(" → ")}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  taskIndex,
  reportId,
  onUpdate,
}: {
  task: TaskItem;
  taskIndex: number;
  reportId: string;
  onUpdate: (ti: number, updates: Partial<TaskItem>) => void;
}) {
  const status = task.status ?? "open";
  const [notes, setNotes] = useState(task.notes ?? "");
  const [saving, setSaving] = useState(false);
  const isClosed = status === "closed";

  const updateStatus = async (newStatus: string) => {
    onUpdate(taskIndex, {
      status: newStatus as TaskItem["status"],
      closed_at: newStatus === "closed" ? new Date().toISOString().slice(0, 10) : undefined,
    });
    try {
      await api.patch(`/api/class-status-reports/${reportId}/tasks/${taskIndex}`, { status: newStatus });
    } catch {
      onUpdate(taskIndex, { status: task.status });
    }
  };

  const saveNotes = async () => {
    if (notes === (task.notes ?? "")) return;
    setSaving(true);
    try {
      await api.patch(`/api/class-status-reports/${reportId}/tasks/${taskIndex}`, { notes });
      onUpdate(taskIndex, { notes });
    } catch {
      setNotes(task.notes ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${PRIORITY_LEFT[task.priority]} rounded-r-xl shadow-sm p-4 space-y-3 transition-opacity ${isClosed ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_BADGE[task.priority]}`}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </span>
            <span className="text-xs text-slate-400 capitalize">{task.category}</span>
            {task.related_code && (
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                {task.related_code}
              </span>
            )}
            {task.due_date && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {task.due_date}
              </span>
            )}
          </div>
          <p className={`font-semibold text-sm leading-snug ${isClosed ? "line-through text-slate-400" : "text-slate-900"}`}>
            {task.title}
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">{task.description}</p>
        </div>
        {isClosed && task.closed_at && (
          <span className="text-xs text-emerald-600 whitespace-nowrap flex-shrink-0 font-medium">
            ✓ Closed {task.closed_at}
          </span>
        )}
      </div>

      {/* Status selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-400 mr-1">Status:</span>
        {(["open", "in_progress", "closed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => updateStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              status === s ? STATUS_ACTIVE[s] : "text-slate-400 hover:bg-slate-100"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Notes */}
      <div className="relative">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add a note for this task…"
          rows={notes ? 2 : 1}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none transition-colors"
        />
        {saving && <Loader2 className="absolute right-2 top-2 w-3 h-3 text-slate-400 animate-spin" />}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClassStatusDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<ClassStatusReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "surveys" | "findings" | "tasks" | "summary">("overview");
  const [taskFilter, setTaskFilter] = useState<"all" | "open" | "in_progress" | "closed">("all");
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    api.get<ClassStatusReport>(`/api/class-status-reports/${id}`)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  const updateTask = useCallback((taskIndex: number, updates: Partial<TaskItem>) => {
    setReport((prev) => {
      if (!prev?.task_list) return prev;
      const tasks = [...prev.task_list];
      tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
      return { ...prev, task_list: tasks };
    });
  }, []);

  const updateFindingActionItems = useCallback((findingIndex: number, statuses: boolean[]) => {
    setReport((prev) => {
      if (!prev?.outstanding_findings) return prev;
      const findings = [...prev.outstanding_findings];
      findings[findingIndex] = { ...findings[findingIndex], action_item_statuses: statuses };
      return { ...prev, outstanding_findings: findings };
    });
  }, []);

  const viewPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const blob = await api.getBlobGet(`/api/class-status-reports/${id}/file`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { /* ignore */ } finally { setPdfLoading(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
    </div>
  );

  if (error || !report) return (
    <div className="p-6 flex items-center gap-2 text-red-600">
      <AlertCircle className="w-5 h-5" /> {error ?? "Report not found"}
    </div>
  );

  const taskList = report.task_list ?? [];
  const findings = report.outstanding_findings ?? [];
  const overdueSurveys = report.overdue_surveys ?? [];
  const upcomingSurveys = report.upcoming_surveys ?? [];

  const tasksDone = taskList.filter((t) => t.status === "closed").length;
  const filteredTasks = taskFilter === "all" ? taskList : taskList.filter((t) => (t.status ?? "open") === taskFilter);

  const findingActionsDone = findings.reduce((acc, f) => acc + (f.action_item_statuses ?? []).filter(Boolean).length, 0);
  const findingActionsTotal = findings.reduce((acc, f) => acc + f.action_items.length, 0);

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "surveys", label: `Surveys (${overdueSurveys.length + upcomingSurveys.length})` },
    { id: "findings", label: `Findings (${findings.length})` },
    { id: "tasks", label: `Tasks (${taskList.length})` },
    ...(report.ai_summary ? [{ id: "summary", label: "AI Summary" }] : []),
  ] as const;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-5 border-b border-slate-200">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.push("/class-status")}
            className="mt-0.5 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <h1 className="text-xl font-semibold text-slate-900 tracking-tight truncate">
                {report.vessel_name || report.filename}
              </h1>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
              {report.imo_number && <span>IMO {report.imo_number}</span>}
              {report.ir_number && <span>IR# {report.ir_number}</span>}
              {report.flag && <span>Flag: {report.flag}</span>}
              {report.class_notation && <span>Class: {report.class_notation}</span>}
              {report.report_date && <span>Report date: {report.report_date}</span>}
            </div>
          </div>
          {report.has_file && (
            <button
              onClick={viewPdf}
              disabled={pdfLoading}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all disabled:opacity-50"
            >
              {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              View PDF
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Overdue Surveys", value: report.overdue_count,
            icon: <AlertTriangle className="w-4 h-4" />,
            iconBg: report.overdue_count > 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600",
            valueColor: report.overdue_count > 0 ? "text-red-600" : "text-emerald-600",
          },
          {
            label: "Upcoming (12 mo)", value: report.upcoming_count,
            icon: <Clock className="w-4 h-4" />,
            iconBg: "bg-amber-100 text-amber-600",
            valueColor: "text-amber-600",
          },
          {
            label: "Outstanding Findings", value: report.findings_count,
            icon: <AlertCircle className="w-4 h-4" />,
            iconBg: report.findings_count > 0 ? "bg-orange-100 text-orange-600" : "bg-emerald-100 text-emerald-600",
            valueColor: report.findings_count > 0 ? "text-orange-600" : "text-emerald-600",
          },
          {
            label: "Tasks Closed", value: `${tasksDone}/${taskList.length}`,
            icon: <CheckCircle2 className="w-4 h-4" />,
            iconBg: tasksDone === taskList.length && taskList.length > 0 ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600",
            valueColor: tasksDone === taskList.length && taskList.length > 0 ? "text-emerald-600" : "text-blue-600",
          },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500">{s.label}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.iconBg}`}>
                {s.icon}
              </div>
            </div>
            <div className={`text-2xl font-bold ${s.valueColor}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "text-blue-600 border-blue-600"
                : "text-slate-500 border-transparent hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {report.overdue_count > 0 && (
            <div className="flex items-start gap-3 px-4 py-3.5 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">
                  {report.overdue_count} overdue survey{report.overdue_count !== 1 ? "s" : ""} — immediate action required
                </p>
                <p className="text-xs text-red-500 mt-0.5">
                  Overdue classification surveys may affect vessel class standing and trading certificates.
                </p>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {taskList.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <ProgressBar done={tasksDone} total={taskList.length} label="Task completion" />
              </div>
            )}
            {findingActionsTotal > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <ProgressBar done={findingActionsDone} total={findingActionsTotal} label="Finding actions completed" />
              </div>
            )}
          </div>

          {taskList.filter((t) => t.priority === "critical" && (t.status ?? "open") !== "closed").length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Critical Open Tasks
              </h3>
              <div className="space-y-3">
                {taskList
                  .map((t, i) => ({ task: t, index: i }))
                  .filter(({ task }) => task.priority === "critical" && (task.status ?? "open") !== "closed")
                  .map(({ task, index }) => (
                    <TaskCard key={index} task={task} taskIndex={index} reportId={id} onUpdate={updateTask} />
                  ))}
              </div>
              <button onClick={() => setActiveTab("tasks")} className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                View all tasks →
              </button>
            </div>
          )}

          {report.overdue_count === 0 && report.findings_count === 0 && taskList.length === 0 && (
            <div className="flex items-center gap-3 px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">Vessel class status is clear — no overdue surveys or outstanding findings.</span>
            </div>
          )}
        </div>
      )}

      {/* ── Surveys ──────────────────────────────────────── */}
      {activeTab === "surveys" && (
        <div className="space-y-8">
          <SurveyTable title="Overdue Surveys" items={overdueSurveys} emptyMsg="No overdue surveys — vessel is compliant on all surveys." />
          <SurveyTable title="Upcoming Surveys (next 12 months)" items={upcomingSurveys} emptyMsg="No surveys due within 12 months." />
        </div>
      )}

      {/* ── Findings ─────────────────────────────────────── */}
      {activeTab === "findings" && (
        <div className="space-y-3">
          {findings.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
              <Ship className="w-5 h-5" />
              <span className="text-sm font-medium">No outstanding findings — all conditions clear.</span>
            </div>
          ) : (
            <>
              {findingActionsTotal > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
                  <ProgressBar done={findingActionsDone} total={findingActionsTotal} label="Action items completed across all findings" />
                </div>
              )}
              {findings.map((f, i) => (
                <FindingRow key={i} finding={f} findingIndex={i} reportId={id} onUpdate={updateFindingActionItems} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Tasks ────────────────────────────────────────── */}
      {activeTab === "tasks" && (
        <div className="space-y-4">
          {taskList.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <ProgressBar done={tasksDone} total={taskList.length} label="Tasks closed" />
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "open", "in_progress", "closed"] as const).map((f) => {
              const count = f === "all" ? taskList.length : taskList.filter((t) => (t.status ?? "open") === f).length;
              return (
                <button
                  key={f}
                  onClick={() => setTaskFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    taskFilter === f
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  {f === "all" ? "All" : STATUS_LABELS[f]} ({count})
                </button>
              );
            })}
          </div>

          {filteredTasks.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">No tasks match this filter.</p>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => {
                const originalIndex = taskList.indexOf(task);
                return (
                  <TaskCard key={originalIndex} task={task} taskIndex={originalIndex} reportId={id} onUpdate={updateTask} />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── AI Summary ───────────────────────────────────── */}
      {activeTab === "summary" && report.ai_summary && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="text-base font-bold text-slate-900 mt-5 mb-2 pb-1.5 border-b border-slate-200">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-bold text-slate-800 mt-4 mb-2 flex items-center gap-2"><span className="w-1 h-4 bg-blue-500 rounded-full inline-block flex-shrink-0" />{children}</h2>,
              h3: ({ children }) => <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mt-3 mb-1.5">{children}</h3>,
              p: ({ children }) => <p className="text-sm text-slate-700 leading-relaxed mb-3">{children}</p>,
              ul: ({ children }) => <ul className="space-y-1.5 mb-3 pl-1">{children}</ul>,
              li: ({ children }) => <li className="text-sm text-slate-600 flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" /><span>{children}</span></li>,
              strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
              table: ({ children }) => <div className="overflow-x-auto mb-3 rounded-lg border border-slate-200"><table className="w-full text-sm">{children}</table></div>,
              th: ({ children }) => <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">{children}</th>,
              td: ({ children }) => <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 last:border-0">{children}</td>,
            }}
          >
            {report.ai_summary}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
