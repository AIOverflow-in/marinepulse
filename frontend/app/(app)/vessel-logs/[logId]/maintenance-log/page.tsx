"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MaintenanceLogRecord, MaintenanceTask, MaintenanceCategory, MaintenanceStatus } from "@/types";
import { ArrowLeft, Loader2, Save, CheckCircle2, Plus, Trash2, Wrench, Zap } from "lucide-react";

const ER_CATEGORY_OPTIONS: { value: MaintenanceCategory; label: string; color: string }[] = [
  { value: "ae",           label: "Aux Engine",   color: "bg-orange-100 text-orange-700" },
  { value: "me",           label: "Main Engine",  color: "bg-red-100 text-red-700" },
  { value: "boiler",       label: "Boiler",       color: "bg-amber-100 text-amber-700" },
  { value: "deck",         label: "Deck",         color: "bg-cyan-100 text-cyan-700" },
  { value: "safety",       label: "Safety",       color: "bg-emerald-100 text-emerald-700" },
  { value: "bwts",         label: "BWTS",         color: "bg-teal-100 text-teal-700" },
  { value: "troubleshoot", label: "Troubleshoot", color: "bg-violet-100 text-violet-700" },
  { value: "engine_room",  label: "General",      color: "bg-slate-100 text-slate-700" },
];

const STATUS_OPTIONS: { value: MaintenanceStatus; label: string; color: string }[] = [
  { value: "complete",    label: "Complete",    color: "text-emerald-600 bg-emerald-50" },
  { value: "in_progress", label: "In Progress", color: "text-amber-600 bg-amber-50" },
  { value: "deferred",    label: "Deferred",    color: "text-slate-500 bg-slate-100" },
  { value: "pending",     label: "Pending",     color: "text-blue-500 bg-blue-50" },
];

function getCategoryConfig(cat: string) {
  return ER_CATEGORY_OPTIONS.find((c) => c.value === cat) || { label: cat, color: "bg-slate-100 text-slate-600" };
}

function resolveStatus(task: MaintenanceTask): MaintenanceStatus {
  if (task.status) return task.status;
  return task.performed ? "complete" : "pending";
}

export default function MaintenanceLogPage() {
  const { logId } = useParams<{ logId: string }>();
  const [record, setRecord] = useState<MaintenanceLogRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<MaintenanceLogRecord>(`/api/vessel-logs/${logId}/maintenance-log`)
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logId]);

  function updateTask(field: "er_tasks" | "electrical_tasks", idx: number, key: keyof MaintenanceTask, value: unknown) {
    if (!record) return;
    const tasks = [...record[field]];
    const updated: MaintenanceTask = { ...tasks[idx], [key]: value };
    if (key === "status") updated.performed = value === "complete";
    else if (key === "performed") updated.status = (value ? "complete" : "pending") as MaintenanceStatus;
    tasks[idx] = updated;
    setRecord({ ...record, [field]: tasks });
  }

  function addTask(field: "er_tasks" | "electrical_tasks") {
    if (!record) return;
    const tasks = record[field];
    const nextSeq = tasks.length > 0 ? Math.max(...tasks.map((t) => t.seq_number)) + 1 : 1;
    const category: MaintenanceCategory = field === "electrical_tasks" ? "electrical" : "engine_room";
    const newTask: MaintenanceTask = {
      seq_number: nextSeq,
      description: "",
      category,
      performed: false,
      status: "pending",
      hours_actual: undefined,
      remarks: "",
    };
    setRecord({ ...record, [field]: [...tasks, newTask] });
  }

  function removeTask(field: "er_tasks" | "electrical_tasks", idx: number) {
    if (!record) return;
    setRecord({ ...record, [field]: record[field].filter((_, i) => i !== idx) });
  }

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    try {
      const result = await api.post<MaintenanceLogRecord>(
        `/api/vessel-logs/${logId}/maintenance-log`,
        record
      );
      setRecord(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      alert((err as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!record) return null;

  const erDone = record.er_tasks.filter((t) => resolveStatus(t) === "complete").length;
  const elecDone = record.electrical_tasks.filter((t) => resolveStatus(t) === "complete").length;

  function renderTaskTable(field: "er_tasks" | "electrical_tasks", showCategory: boolean) {
    const tasks = record![field];
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-3 py-2.5 w-10 font-semibold text-slate-500">#</th>
                {showCategory && (
                  <th className="text-left px-3 py-2.5 w-28 font-semibold text-slate-500">Category</th>
                )}
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Description</th>
                <th className="text-left px-3 py-2.5 w-32 font-semibold text-slate-500">Status</th>
                <th className="text-left px-3 py-2.5 w-20 font-semibold text-slate-500">Hrs</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Remarks</th>
                <th className="w-10 px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={showCategory ? 7 : 6} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No tasks yet — click &ldquo;+ Add Task&rdquo; below to begin.
                  </td>
                </tr>
              )}
              {tasks.map((task, idx) => {
                const st = resolveStatus(task);
                const catCfg = getCategoryConfig(task.category);
                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50/50 ${
                      st === "complete" ? "bg-emerald-50/30" :
                      st === "in_progress" ? "bg-amber-50/30" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-slate-400 font-semibold">{task.seq_number}</td>
                    {showCategory && (
                      <td className="px-3 py-2">
                        <select
                          value={task.category}
                          onChange={(e) => updateTask(field, idx, "category", e.target.value as MaintenanceCategory)}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 ${catCfg.color}`}
                        >
                          {ER_CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <textarea
                        rows={1}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none overflow-hidden"
                        placeholder="Task description…"
                        value={task.description}
                        onChange={(e) => {
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
                          updateTask(field, idx, "description", e.target.value);
                        }}
                        onFocus={(e) => {
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={st}
                        onChange={(e) => updateTask(field, idx, "status", e.target.value)}
                        className={`w-full px-2 py-1 rounded text-xs border-0 font-medium focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer ${
                          STATUS_OPTIONS.find((s) => s.value === st)?.color ?? ""
                        }`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="—"
                        value={task.hours_actual ?? ""}
                        onChange={(e) => updateTask(field, idx, "hours_actual", e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="—"
                        value={task.remarks || ""}
                        onChange={(e) => updateTask(field, idx, "remarks", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => removeTask(field, idx)}
                        className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center gap-4">
          <button
            onClick={() => addTask(field)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </button>
          {tasks.length > 0 && (
            <span className="text-xs text-slate-400">
              {tasks.filter((t) => resolveStatus(t) === "complete").length} complete / {tasks.length} total
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm text-slate-500">
        <Link href={`/vessel-logs/${logId}`} className="hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Log
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Maintenance Log</span>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Weekly Maintenance Log</h1>
          <p className="text-xs text-slate-500 mt-0.5">Form 056 — Planned/Performed Maintenance Record</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
      </div>

      {/* Completed by / Reviewed by */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Completed by</label>
          <input
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Officer name & rank"
            value={record.completed_by}
            onChange={(e) => setRecord({ ...record, completed_by: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Reviewed by</label>
          <input
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Chief Engineer / Superintendent"
            value={record.reviewed_by || ""}
            onChange={(e) => setRecord({ ...record, reviewed_by: e.target.value })}
          />
        </div>
      </div>

      {/* Engine Room Tasks */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
            <Wrench className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Engine Room Tasks</h2>
            <p className="text-xs text-slate-400">{erDone} / {record.er_tasks.length} complete</p>
          </div>
        </div>
        {renderTaskTable("er_tasks", true)}
      </section>

      {/* Electrical Tasks */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Electrical Tasks</h2>
            <p className="text-xs text-slate-400">{elecDone} / {record.electrical_tasks.length} complete</p>
          </div>
        </div>
        {renderTaskTable("electrical_tasks", false)}
      </section>

      {/* Save bottom */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save Maintenance Log"}
        </button>
      </div>
    </div>
  );
}
