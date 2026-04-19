"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MaintenanceLogRecord, MaintenanceTask, MaintenanceCategory, MaintenanceStatus } from "@/types";
import { ArrowLeft, Loader2, Save, CheckCircle2, Plus, Trash2 } from "lucide-react";

const CATEGORIES: { key: MaintenanceCategory; label: string; field: "er_tasks" | "electrical_tasks" }[] = [
  { key: "ae",           label: "Aux Engine",     field: "er_tasks" },
  { key: "me",           label: "Main Engine",    field: "er_tasks" },
  { key: "boiler",       label: "Boiler",         field: "er_tasks" },
  { key: "deck",         label: "Deck",           field: "er_tasks" },
  { key: "safety",       label: "Safety & LSA",   field: "er_tasks" },
  { key: "bwts",         label: "BWTS",           field: "er_tasks" },
  { key: "electrical",   label: "Electrical",     field: "electrical_tasks" },
  { key: "troubleshoot", label: "Troubleshoot",   field: "er_tasks" },
];

const STATUS_OPTIONS: { value: MaintenanceStatus; label: string; color: string }[] = [
  { value: "complete",    label: "Complete",     color: "text-emerald-600 bg-emerald-50" },
  { value: "in_progress", label: "In Progress",  color: "text-amber-600 bg-amber-50" },
  { value: "deferred",    label: "Deferred",     color: "text-slate-500 bg-slate-100" },
  { value: "pending",     label: "Pending",      color: "text-blue-500 bg-blue-50" },
];

function resolveStatus(task: MaintenanceTask): MaintenanceStatus {
  if (task.status) return task.status;
  return task.performed ? "complete" : "pending";
}

function makeTask(category: MaintenanceCategory, seq: number): MaintenanceTask {
  return { seq_number: seq, description: "", category, performed: false, status: "pending", hours_actual: undefined, remarks: "" };
}

export default function MaintenanceLogPage() {
  const { logId } = useParams<{ logId: string }>();
  const [record, setRecord] = useState<MaintenanceLogRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeCategory, setActiveCategory] = useState<MaintenanceCategory>("ae");

  useEffect(() => {
    api.get<MaintenanceLogRecord>(`/api/vessel-logs/${logId}/maintenance-log`)
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logId]);

  const catConfig = CATEGORIES.find((c) => c.key === activeCategory)!;

  function allTasksForField(field: "er_tasks" | "electrical_tasks"): MaintenanceTask[] {
    return record ? record[field] : [];
  }

  function tasksForCategory(): MaintenanceTask[] {
    if (!record) return [];
    const list = record[catConfig.field];
    if (catConfig.field === "electrical_tasks") return list;
    // for er_tasks, filter by category; legacy "engine_room" falls under all non-electrical tabs
    return list.filter((t) => t.category === activeCategory || (t.category === "engine_room" && activeCategory === "me"));
  }

  function setTasksForCategory(updated: MaintenanceTask[]) {
    if (!record) return;
    const field = catConfig.field;
    if (field === "electrical_tasks") {
      setRecord({ ...record, electrical_tasks: updated });
      return;
    }
    // merge updated tasks back into er_tasks, replacing only those of this category
    const others = record.er_tasks.filter(
      (t) => !(t.category === activeCategory || (t.category === "engine_room" && activeCategory === "me"))
    );
    setRecord({ ...record, er_tasks: [...others, ...updated] });
  }

  function updateTask(idx: number, field: keyof MaintenanceTask, value: unknown) {
    const t = [...tasksForCategory()];
    const updated = { ...t[idx], [field]: value };
    // keep performed in sync with status
    if (field === "status") {
      updated.performed = value === "complete";
    } else if (field === "performed") {
      updated.status = value ? "complete" : "pending";
    }
    t[idx] = updated;
    setTasksForCategory(t);
  }

  function addTask() {
    const t = tasksForCategory();
    const allTasks = [...allTasksForField(catConfig.field)];
    const nextSeq = allTasks.length > 0 ? Math.max(...allTasks.map((x) => x.seq_number)) + 1 : 1;
    setTasksForCategory([...t, makeTask(activeCategory, nextSeq)]);
  }

  function removeTask(idx: number) {
    const filtered = tasksForCategory().filter((_, i) => i !== idx);
    // don't renumber globally — just update filtered list
    setTasksForCategory(filtered);
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

  const currentTasks = tasksForCategory();
  const doneCount = currentTasks.filter((t) => resolveStatus(t) === "complete").length;
  const inProgressCount = currentTasks.filter((t) => resolveStatus(t) === "in_progress").length;

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
      <div className="grid grid-cols-2 gap-4 mb-6">
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

      {/* 8 Category Tabs */}
      <div className="flex gap-0.5 mb-4 border-b border-slate-200 overflow-x-auto">
        {CATEGORIES.map((cat) => {
          const list = record[cat.field];
          const catTasks = cat.field === "electrical_tasks"
            ? list
            : list.filter((t) => t.category === cat.key || (t.category === "engine_room" && cat.key === "me"));
          const done = catTasks.filter((t) => resolveStatus(t) === "complete").length;
          const inProg = catTasks.filter((t) => resolveStatus(t) === "in_progress").length;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex-shrink-0 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {cat.label}
              {catTasks.length > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full ${
                  inProg > 0
                    ? "bg-amber-100 text-amber-600"
                    : done === catTasks.length
                    ? "bg-emerald-50 text-emerald-600"
                    : isActive ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
                }`}>
                  {done}/{catTasks.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Task table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-3 py-2.5 w-10 font-semibold text-slate-500">#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Description</th>
                <th className="text-left px-3 py-2.5 w-36 font-semibold text-slate-500">Status</th>
                <th className="text-left px-3 py-2.5 w-20 font-semibold text-slate-500">Hrs</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Remarks</th>
                <th className="w-10 px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentTasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No tasks yet for this category. Click &ldquo;+ Add Task&rdquo; below to begin.
                  </td>
                </tr>
              )}
              {currentTasks.map((task, idx) => {
                const st = resolveStatus(task);
                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50/50 ${
                      st === "complete" ? "bg-emerald-50/30" :
                      st === "in_progress" ? "bg-amber-50/30" :
                      st === "deferred" ? "bg-slate-50/50" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-slate-500 font-semibold">{task.seq_number}</td>
                    <td className="px-3 py-2">
                      <textarea
                        rows={1}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none overflow-hidden"
                        placeholder="Task description…"
                        value={task.description}
                        onChange={(e) => {
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
                          updateTask(idx, "description", e.target.value);
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
                        onChange={(e) => updateTask(idx, "status", e.target.value)}
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
                        onChange={(e) => updateTask(idx, "hours_actual", e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="—"
                        value={task.remarks || ""}
                        onChange={(e) => updateTask(idx, "remarks", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => removeTask(idx)}
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
            onClick={addTask}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </button>
          {currentTasks.length > 0 && (
            <span className="text-xs text-slate-400">
              {doneCount} complete
              {inProgressCount > 0 && <>, {inProgressCount} in progress</>}
              {" "}/ {currentTasks.length} total
            </span>
          )}
        </div>
      </div>

      {/* Save bottom */}
      <div className="flex justify-end mt-4">
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
