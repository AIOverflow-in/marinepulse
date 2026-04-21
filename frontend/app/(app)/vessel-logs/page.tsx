"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { VesselWeeklyLog, OverdueAlert, Vessel } from "@/types";
import {
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  BookMarked,
  ChevronRight,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  complete: "bg-emerald-500",
  partial: "bg-amber-400",
  missing: "bg-red-400",
  future: "bg-slate-200",
};

const STATUS_TITLES: Record<string, string> = {
  complete: "All 5 templates complete",
  partial: "Some templates missing",
  missing: "No log submitted",
  future: "Future week",
};

// ─── New Log Modal ────────────────────────────────────────────────────────────

function NewLogModal({
  vessels,
  onClose,
  onCreated,
}: {
  vessels: Vessel[];
  onClose: () => void;
  onCreated: (log: VesselWeeklyLog) => void;
}) {
  const currentYear = new Date().getFullYear();
  const currentWeek = getISOWeek(new Date());

  const [form, setForm] = useState({
    vessel_id: vessels[0]?.id || "",
    vessel_name: vessels[0]?.name || "",
    week_number: currentWeek,
    year: currentYear,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleVesselChange(id: string) {
    const v = vessels.find((v) => v.id === id);
    setForm({ ...form, vessel_id: id, vessel_name: v?.name || "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vessel_id) return;
    setSaving(true);
    setError("");
    try {
      const log = await api.post<VesselWeeklyLog>("/api/vessel-logs", form);
      onCreated(log);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">New Weekly Log</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vessel</label>
            <select
              value={form.vessel_id}
              onChange={(e) => handleVesselChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              required
            >
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Week Number</label>
              <input
                type="number"
                min={1}
                max={52}
                value={form.week_number}
                onChange={(e) => setForm({ ...form, week_number: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
              <input
                type="number"
                min={2020}
                max={2030}
                value={form.year}
                onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.vessel_id}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating…" : "Create Log"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Compliance Calendar ──────────────────────────────────────────────────────

function ComplianceCalendar({
  vessels,
  logs,
  year,
}: {
  vessels: { vessel_id: string; vessel_name: string; weeks: Record<string, string> }[];
  logs: VesselWeeklyLog[];
  year: number;
}) {
  const router = useRouter();
  const currentWeek = getISOWeek(new Date());
  const currentYear = new Date().getFullYear();

  if (!vessels.length) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        No vessel logs for {year}. Create a weekly log to get started.
      </div>
    );
  }

  function handleCellClick(vesselId: string, week: number) {
    const log = logs.find(
      (l) => l.vessel_id === vesselId && l.week_number === week && l.year === year
    );
    if (log) {
      router.push(`/vessel-logs/${log.id}`);
    }
  }

  return (
    <div className="overflow-x-auto">
      {vessels.map((vessel) => (
        <div key={vessel.vessel_id} className="mb-5">
          <div className="text-xs font-semibold text-slate-700 mb-2 px-1">{vessel.vessel_name}</div>
          <div className="flex gap-0.5 flex-wrap">
            {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
              const status = vessel.weeks[String(w)] || (
                year < currentYear || (year === currentYear && w <= currentWeek) ? "missing" : "future"
              );
              const isCurrentWeek = year === currentYear && w === currentWeek;
              const hasLog = status === "complete" || status === "partial";
              return (
                <button
                  key={w}
                  title={`Week ${w} — ${STATUS_TITLES[status] || status}`}
                  onClick={() => hasLog && handleCellClick(vessel.vessel_id, w)}
                  className={`
                    w-5 h-5 rounded-sm text-[9px] font-bold transition-all
                    ${STATUS_COLORS[status] || "bg-slate-200"}
                    ${isCurrentWeek ? "ring-2 ring-blue-500 ring-offset-1" : ""}
                    ${hasLog ? "hover:opacity-70 cursor-pointer" : "cursor-default"}
                  `}
                >
                  {w % 4 === 1 ? <span className="opacity-60">{w}</span> : ""}
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
            {Object.entries(STATUS_TITLES).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-sm inline-block ${STATUS_COLORS[k]}`} />
                {v.split(" ")[0]}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export default function VesselLogsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [filterWeek, setFilterWeek] = useState<number | "">("");
  const [filterYear, setFilterYear] = useState<number | "">("");
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [logs, setLogs] = useState<VesselWeeklyLog[]>([]);
  const [calendar, setCalendar] = useState<{ vessel_id: string; vessel_name: string; weeks: Record<string, string> }[]>([]);
  const [overdueAlerts, setOverdueAlerts] = useState<OverdueAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedVesselId, setSelectedVesselId] = useState<string>("");

  useEffect(() => {
    api.get<{ items: Vessel[] }>("/api/vessels").then((d) => {
      setVessels(d.items || []);
      if (d.items?.length) setSelectedVesselId(d.items[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchAll();
  }, [year]);

  useEffect(() => {
    if (selectedVesselId) fetchOverdue();
  }, [selectedVesselId]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [logsData, calData] = await Promise.all([
        api.get<{ items: VesselWeeklyLog[] }>(`/api/vessel-logs?year=${year}&limit=100`),
        api.get<{ vessels: typeof calendar }>(`/api/vessel-logs/compliance-calendar?year=${year}`),
      ]);
      setLogs(logsData.items || []);
      setCalendar(calData.vessels || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function fetchOverdue() {
    if (!selectedVesselId) return;
    try {
      const data = await api.get<{ alerts: OverdueAlert[] }>(
        `/api/vessel-logs/overdue-alerts?vessel_id=${selectedVesselId}`
      );
      setOverdueAlerts(data.alerts || []);
    } catch {
      setOverdueAlerts([]);
    }
  }

  function handleCreated(log: VesselWeeklyLog) {
    setLogs((prev) => [log, ...prev]);
    setShowModal(false);
    fetchAll();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {showModal && (
        <NewLogModal
          vessels={vessels}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vessel Logs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Weekly operational records — safety checks, maintenance, drills & engine performance
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Weekly Log
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Calendar + Recent Logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Compliance Calendar */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <BookMarked className="w-4 h-4 text-blue-500" />
                Compliance Calendar
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setYear((y) => y - 1)}
                  className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                >
                  ← {year - 1}
                </button>
                <span className="text-sm font-semibold text-slate-800 px-2">{year}</span>
                <button
                  onClick={() => setYear((y) => y + 1)}
                  className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                >
                  {year + 1} →
                </button>
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <ComplianceCalendar vessels={calendar} logs={logs} year={year} />
            )}
          </div>

          {/* Recent Logs Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
              <h2 className="font-semibold text-slate-800">Recent Logs</h2>
              <div className="flex items-center gap-2">
                <select
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={filterWeek}
                  onChange={(e) => setFilterWeek(e.target.value === "" ? "" : parseInt(e.target.value))}
                >
                  <option value="">All Weeks</option>
                  {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>Week {w}</option>
                  ))}
                </select>
                <select
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value === "" ? "" : parseInt(e.target.value))}
                >
                  <option value="">All Years</option>
                  {[2023, 2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                {(filterWeek !== "" || filterYear !== "") && (
                  <button
                    onClick={() => { setFilterWeek(""); setFilterYear(""); }}
                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No logs yet. Create a weekly log to get started.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vessel</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Week</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Completion</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.filter((log) => {
                    if (filterWeek !== "" && log.week_number !== filterWeek) return false;
                    if (filterYear !== "" && log.year !== filterYear) return false;
                    return true;
                  }).map((log) => {
                    const done = [
                      log.has_safety_checks,
                      log.has_maintenance_log,
                      (log.photo_count || 0) > 0,
                      (log.drill_count || 0) > 0,
                      log.has_me_performance,
                    ].filter(Boolean).length;
                    return (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{log.vessel_name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          Week {log.week_number}, {log.year}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                            log.status === "submitted"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : log.status === "reviewed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}>
                            {log.status === "submitted" && <CheckCircle2 className="w-3 h-3" />}
                            {log.status === "draft" && <Clock className="w-3 h-3" />}
                            {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }, (_, i) => (
                                <div
                                  key={i}
                                  className={`w-3 h-3 rounded-sm ${i < done ? "bg-emerald-500" : "bg-slate-200"}`}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-slate-500">{done}/5</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/vessel-logs/${log.id}`}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Open <ChevronRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Overdue Alerts */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Overdue Alerts
              </h2>
              {vessels.length > 1 && (
                <select
                  value={selectedVesselId}
                  onChange={(e) => setSelectedVesselId(e.target.value)}
                  className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                >
                  {vessels.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              )}
            </div>
            {overdueAlerts.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">All tests up to date</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {overdueAlerts.slice(0, 15).map((alert) => (
                  <div
                    key={alert.item_code}
                    className={`rounded-lg px-3 py-2.5 border text-xs ${
                      alert.days_overdue > 30
                        ? "bg-red-50 border-red-200"
                        : "bg-amber-50 border-amber-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-bold text-slate-700">{alert.item_code}</span>
                      <span className={`font-semibold ${alert.days_overdue > 30 ? "text-red-600" : "text-amber-600"}`}>
                        {alert.days_overdue === 999 ? "Never done" : `${alert.days_overdue}d overdue`}
                      </span>
                    </div>
                    <p className="text-slate-600 leading-snug line-clamp-2">{alert.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="uppercase text-slate-400 font-medium">{alert.frequency}</span>
                      {alert.last_done && (
                        <span className="text-slate-400">· Last: {new Date(alert.last_done).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
