"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MaintenanceLogRecord, MaintenanceTask } from "@/types";
import { ArrowLeft, Loader2, Save, CheckCircle2, Plus, Trash2 } from "lucide-react";

type Tab = "engine_room" | "electrical";

const TAB_LABELS: Record<Tab, string> = {
  engine_room: "Engine Room",
  electrical: "Electrical",
};

function makeTask(category: Tab, seq: number): MaintenanceTask {
  return { seq_number: seq, description: "", category, performed: false, hours_actual: undefined, remarks: "" };
}

export default function MaintenanceLogPage() {
  const { logId } = useParams<{ logId: string }>();
  const [record, setRecord] = useState<MaintenanceLogRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("engine_room");

  useEffect(() => {
    api.get<MaintenanceLogRecord>(`/api/vessel-logs/${logId}/maintenance-log`)
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logId]);

  function tasks(): MaintenanceTask[] {
    if (!record) return [];
    return tab === "engine_room" ? record.er_tasks : record.electrical_tasks;
  }

  function setTasks(updated: MaintenanceTask[]) {
    if (!record) return;
    if (tab === "engine_room") {
      setRecord({ ...record, er_tasks: updated });
    } else {
      setRecord({ ...record, electrical_tasks: updated });
    }
  }

  function updateTask(idx: number, field: keyof MaintenanceTask, value: unknown) {
    const t = [...tasks()];
    t[idx] = { ...t[idx], [field]: value };
    setTasks(t);
  }

  function addTask() {
    const t = tasks();
    const nextSeq = t.length > 0 ? Math.max(...t.map((x) => x.seq_number)) + 1 : 1;
    setTasks([...t, makeTask(tab, nextSeq)]);
  }

  function removeTask(idx: number) {
    const t = tasks().filter((_, i) => i !== idx);
    // renumber
    setTasks(t.map((task, i) => ({ ...task, seq_number: i + 1 })));
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

  const currentTasks = tasks();
  const performedCount = currentTasks.filter((t) => t.performed).length;

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

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {(["engine_room", "electrical"] as Tab[]).map((t) => {
          const count = (t === "engine_room" ? record.er_tasks : record.electrical_tasks).length;
          const performed = (t === "engine_room" ? record.er_tasks : record.electrical_tasks).filter((x) => x.performed).length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {TAB_LABELS[t]}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                tab === t ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
              }`}>
                {performed}/{count}
              </span>
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
                <th className="px-3 py-2.5 w-20 text-center font-semibold text-slate-500">Done</th>
                <th className="text-left px-3 py-2.5 w-24 font-semibold text-slate-500">Hrs</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Remarks</th>
                <th className="w-10 px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentTasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No tasks yet. Click "+ Add Task" below to begin.
                  </td>
                </tr>
              )}
              {currentTasks.map((task, idx) => (
                <tr key={idx} className={`hover:bg-slate-50/50 ${task.performed ? "bg-emerald-50/30" : ""}`}>
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
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={task.performed}
                      onChange={(e) => updateTask(idx, "performed", e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
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
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={addTask}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </button>
          {currentTasks.length > 0 && (
            <span className="ml-4 text-xs text-slate-400">
              {performedCount} of {currentTasks.length} performed
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
