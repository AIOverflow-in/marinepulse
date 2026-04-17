"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { DrillRecord } from "@/types";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  X,
  Save,
  FileText,
} from "lucide-react";

const DRILL_TYPE_LABELS: Record<string, string> = {
  fire_drill: "Fire Drill",
  abandon_ship_drill: "Abandon Ship Drill",
  man_overboard_drill: "Man Overboard Drill",
  enclosed_space_drill: "Enclosed Space Drill",
  lsa_routine_check: "LSA Routine Check",
  qs_safety_meeting: "QS & Safety Meeting",
  lifeboat_drill: "Lifeboat Drill",
  medical_drill: "Medical Drill",
  oil_spill_drill: "Oil Spill Drill",
  emergency_steering_drill: "Emergency Steering Drill",
  security_drill: "Security Drill",
};

const DRILL_TYPE_COLORS: Record<string, string> = {
  fire_drill: "bg-red-100 text-red-700",
  abandon_ship_drill: "bg-orange-100 text-orange-700",
  man_overboard_drill: "bg-blue-100 text-blue-700",
  enclosed_space_drill: "bg-yellow-100 text-yellow-700",
  lsa_routine_check: "bg-emerald-100 text-emerald-700",
  qs_safety_meeting: "bg-slate-100 text-slate-700",
  lifeboat_drill: "bg-cyan-100 text-cyan-700",
  medical_drill: "bg-pink-100 text-pink-700",
  oil_spill_drill: "bg-amber-100 text-amber-700",
  emergency_steering_drill: "bg-violet-100 text-violet-700",
  security_drill: "bg-indigo-100 text-indigo-700",
};

interface DrillForm {
  drill_type: string;
  drill_date: string;
  drill_time: string;
  location: string;
  conducted_by: string;
  attendees_text: string;   // newline-separated crew names
  observations: string;
  corrective_actions: string;
}

const EMPTY_FORM: DrillForm = {
  drill_type: "fire_drill",
  drill_date: new Date().toISOString().split("T")[0],
  drill_time: "",
  location: "",
  conducted_by: "",
  attendees_text: "",
  observations: "",
  corrective_actions: "",
};

export default function DrillsPage() {
  const { logId } = useParams<{ logId: string }>();
  const [drills, setDrills] = useState<DrillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<DrillForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchDrills();
  }, [logId]);

  async function fetchDrills() {
    try {
      const data = await api.get<DrillRecord[]>(`/api/vessel-logs/${logId}/drills`);
      setDrills(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowModal(true);
  }

  function openEdit(drill: DrillRecord) {
    setForm({
      drill_type: drill.drill_type,
      drill_date: drill.drill_date,
      drill_time: drill.drill_time || "",
      location: drill.location || "",
      conducted_by: drill.conducted_by,
      attendees_text: (drill.attendees || []).join("\n"),
      observations: drill.observations || "",
      corrective_actions: drill.corrective_actions || "",
    });
    setEditId(drill.id);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const attendees = form.attendees_text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      drill_type: form.drill_type,
      drill_date: form.drill_date,
      drill_time: form.drill_time || null,
      location: form.location || null,
      conducted_by: form.conducted_by,
      attendees,
      attendee_count: attendees.length || 0,
      observations: form.observations || null,
      corrective_actions: form.corrective_actions || null,
    };
    try {
      if (editId) {
        const updated = await api.put<DrillRecord>(
          `/api/vessel-logs/${logId}/drills/${editId}`,
          payload
        );
        setDrills((prev) => prev.map((d) => (d.id === editId ? updated : d)));
      } else {
        const created = await api.post<DrillRecord>(
          `/api/vessel-logs/${logId}/drills`,
          payload
        );
        setDrills((prev) => [...prev, created]);
      }
      closeModal();
    } catch (err: unknown) {
      alert((err as Error).message || "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(drillId: string) {
    if (!confirm("Delete this drill record?")) return;
    setDeleting(drillId);
    try {
      await api.delete(`/api/vessel-logs/${logId}/drills/${drillId}`);
      setDrills((prev) => prev.filter((d) => d.id !== drillId));
    } catch {
      /* ignore */
    } finally {
      setDeleting(null);
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
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
        <span className="text-slate-800 font-medium">Drills & Training</span>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Drills & LSA Training</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Weekly drill records — {drills.length} event{drills.length !== 1 ? "s" : ""} logged
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Drill
        </button>
      </div>

      {drills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-xl text-slate-400">
          <FileText className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No drills recorded yet</p>
          <p className="text-xs mt-1">Click "Add Drill" to log a drill or safety meeting</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs">Location</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs">Conducted by</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs">Attendees</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drills.map((drill) => (
                <tr key={drill.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                      DRILL_TYPE_COLORS[drill.drill_type] || "bg-slate-100 text-slate-700"
                    }`}>
                      {DRILL_TYPE_LABELS[drill.drill_type] || drill.drill_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-xs">
                    {formatDate(drill.drill_date)}
                    {drill.drill_time && (
                      <span className="text-slate-400 ml-1">{drill.drill_time}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{drill.location || "—"}</td>
                  <td className="px-4 py-3 text-slate-700 text-xs">{drill.conducted_by}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {drill.attendees && drill.attendees.length > 0 ? (
                      <span title={drill.attendees.join(", ")}>
                        {drill.attendees.slice(0, 2).join(", ")}
                        {drill.attendees.length > 2 && (
                          <span className="text-slate-400"> +{drill.attendees.length - 2} more</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-400">{drill.attendee_count || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(drill)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(drill.id)}
                        disabled={deleting === drill.id}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        {deleting === drill.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">
                {editId ? "Edit Drill Record" : "Add Drill Record"}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Drill type */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Drill Type</label>
                <select
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.drill_type}
                  onChange={(e) => setForm({ ...form, drill_type: e.target.value })}
                >
                  {Object.entries(DRILL_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.drill_date}
                    onChange={(e) => setForm({ ...form, drill_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Time (optional)</label>
                  <input
                    type="time"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.drill_time}
                    onChange={(e) => setForm({ ...form, drill_time: e.target.value })}
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Location (optional)</label>
                <input
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Foam Room, Galley, Muster Station"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>

              {/* Conducted by */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Conducted by</label>
                <input
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Officer name / rank"
                  value={form.conducted_by}
                  onChange={(e) => setForm({ ...form, conducted_by: e.target.value })}
                />
              </div>

              {/* Attendee names */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Crew Attendees
                  <span className="text-slate-400 font-normal ml-1">(one name per line or comma-separated)</span>
                </label>
                <textarea
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                  placeholder={"Master\nChief Officer\n2nd Officer\nBosun\nAB Smith"}
                  value={form.attendees_text}
                  onChange={(e) => setForm({ ...form, attendees_text: e.target.value })}
                />
                {form.attendees_text.trim() && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    {form.attendees_text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length} attendees
                  </p>
                )}
              </div>

              {/* Observations */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Observations (optional)</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="What was observed during the drill…"
                  value={form.observations}
                  onChange={(e) => setForm({ ...form, observations: e.target.value })}
                />
              </div>

              {/* Corrective actions */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Corrective Actions (optional)</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Any follow-up actions required…"
                  value={form.corrective_actions}
                  onChange={(e) => setForm({ ...form, corrective_actions: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {submitting ? "Saving…" : editId ? "Update" : "Add Drill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
