"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MaintenanceLogRecord, MaintenanceTask } from "@/types";
import { ArrowLeft, Loader2, Save, CheckCircle2, Plus, Trash2, Wrench, Zap } from "lucide-react";

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
    tasks[idx] = { ...tasks[idx], [key]: value };
    setRecord({ ...record, [field]: tasks });
  }

  function addTask(field: "er_tasks" | "electrical_tasks") {
    if (!record) return;
    const tasks = record[field];
    const nextSeq = tasks.length > 0 ? Math.max(...tasks.map((t) => t.seq_number)) + 1 : 1;
    const newTask: MaintenanceTask = {
      seq_number: nextSeq,
      description: "",
      category: field === "electrical_tasks" ? "electrical" : "engine_room",
      performed: false,
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

  const erDone = record.er_tasks.filter((t) => t.performed).length;
  const elecDone = record.electrical_tasks.filter((t) => t.performed).length;

  function renderTaskTable(field: "er_tasks" | "electrical_tasks") {
    const tasks = record![field];
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-3 py-2.5 w-10 font-semibold text-slate-500">#</th>
                <th className="px-3 py-2.5 w-10 text-center font-semibold text-slate-500">✓</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Maintenance Task</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Remarks</th>
                <th className="w-10 px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No tasks yet — click &ldquo;+ Add Task&rdquo; below to begin.
                  </td>
                </tr>
              )}
              {tasks.map((task, idx) => (
                <tr
                  key={idx}
                  className={`hover:bg-slate-50/50 ${task.performed ? "bg-emerald-50/30" : ""}`}
                >
                  <td className="px-3 py-2 font-mono text-slate-400 font-semibold">{task.seq_number}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={task.performed}
                      onChange={(e) => updateTask(field, idx, "performed", e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </td>
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
              ))}
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
              {tasks.filter((t) => t.performed).length} done / {tasks.length} total
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

      {/* Header fields */}
      <div className="grid grid-cols-3 gap-4 mb-8">
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
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Completion Date</label>
          <input
            type="date"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={record.completion_date || ""}
            onChange={(e) => setRecord({ ...record, completion_date: e.target.value || undefined })}
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
            <p className="text-xs text-slate-400">{erDone} / {record.er_tasks.length} done</p>
          </div>
        </div>
        {renderTaskTable("er_tasks")}
      </section>

      {/* Electrical Tasks */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Electrical Tasks</h2>
            <p className="text-xs text-slate-400">{elecDone} / {record.electrical_tasks.length} done</p>
          </div>
        </div>
        {renderTaskTable("electrical_tasks")}
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
