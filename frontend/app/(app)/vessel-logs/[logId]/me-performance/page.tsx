"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MEPerformanceRecord, CylinderData } from "@/types";
import {
  ArrowLeft,
  Loader2,
  Save,
  CheckCircle2,
  AlertTriangle,
  BarChart2,
  ChevronDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from "recharts";

const TBN_WARN_THRESHOLD = 40;
const TBN_LOW_THRESHOLD = 20;
const FE_WARN_THRESHOLD = 200;
const FE_CAUTION_THRESHOLD = 500;
const FE_CRITICAL_THRESHOLD = 800;

const OIL_TYPE_OPTIONS = [
  "TARO ULTRA 140",
  "TARO SPECIAL HT 140",
  "DOLEX J140",
  "MOBILGARD M540",
  "MOBILGARD 540",
  "SHELL GADINIA 40",
  "CASTROL CYLTECH 140",
  "TOTAL TALUSIA UNIVERSAL 100",
  "VALVOLINE CYGNUS 140 HD",
  "Other",
];

function tbnColor(val?: number | null): string {
  if (val == null) return "text-slate-400";
  if (val < TBN_WARN_THRESHOLD) return "text-amber-600 font-semibold";
  return "text-emerald-600";
}

function feColor(val?: number | null): string {
  if (val == null) return "text-slate-400";
  if (val >= FE_CRITICAL_THRESHOLD) return "text-red-600 font-bold";
  if (val >= FE_WARN_THRESHOLD) return "text-amber-600 font-semibold";
  return "text-slate-700";
}

function tbnBarColor(val?: number | null): string {
  if (val == null) return "#94a3b8";
  if (val < TBN_WARN_THRESHOLD) return "#f59e0b";
  return "#10b981";
}

function feBarColor(val?: number | null): string {
  if (val == null) return "#94a3b8";
  if (val >= FE_CRITICAL_THRESHOLD) return "#ef4444";
  if (val >= FE_CAUTION_THRESHOLD) return "#f97316";
  if (val >= FE_WARN_THRESHOLD) return "#f59e0b";
  return "#10b981";
}

function cylinderDiagnosis(fe?: number | null, tbn?: number | null): { label: string; color: string } {
  if (fe == null && tbn == null) return { label: "No data", color: "text-slate-400" };
  if (fe != null && fe >= FE_CRITICAL_THRESHOLD)
    return { label: "CRITICAL — Act immediately, investigate liner/ring wear", color: "text-red-600" };
  if (fe != null && fe >= FE_CAUTION_THRESHOLD && tbn != null && tbn < TBN_LOW_THRESHOLD)
    return { label: "Cold Corrosion risk — increase CLO feed rate or switch to higher BN oil", color: "text-orange-600" };
  if (fe != null && fe >= FE_WARN_THRESHOLD)
    return { label: "Elevated Fe — monitor closely", color: "text-amber-600" };
  if (fe != null && fe < FE_WARN_THRESHOLD && tbn != null && tbn > TBN_WARN_THRESHOLD)
    return { label: "Over-lubrication risk — consider decreasing CLO feed rate", color: "text-blue-600" };
  if (fe != null && fe < FE_WARN_THRESHOLD && tbn != null && tbn < TBN_LOW_THRESHOLD)
    return { label: "Low TBN — acid neutralization risk despite normal Fe", color: "text-amber-600" };
  return { label: "Normal operation", color: "text-emerald-600" };
}

function buildBlankRecord(logId: string): MEPerformanceRecord {
  return {
    id: null,
    log_id: logId,
    record_date: new Date().toISOString().split("T")[0],
    oil_type: "",
    tbn_nominal: undefined,
    engine_run_hours: undefined,
    shaft_power_kw: undefined,
    speed_rpm: undefined,
    fuel_index: undefined,
    acc_g_kwhxs: undefined,
    min_feed_rate_g_kwh: undefined,
    sulphur_content_pct: undefined,
    specific_feed_rate_g_kwh: undefined,
    cylinders: Array.from({ length: 6 }, (_, i): CylinderData => ({
      cylinder_number: i + 1,
      tbn_residual: undefined,
      fe_ppm: undefined,
      drain_oil_bn: undefined,
      liner_wear_mm: undefined,
      remarks: "",
    })),
    notes: "",
    completed_by: "",
  };
}

function numField(val: number | undefined | null): string {
  return val != null ? String(val) : "";
}

export default function MEPerformancePage() {
  const { logId } = useParams<{ logId: string }>();
  const [record, setRecord] = useState<MEPerformanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisFrom, setAnalysisFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [analysisTo, setAnalysisTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [oilTypeOther, setOilTypeOther] = useState("");

  useEffect(() => {
    api.get<MEPerformanceRecord>(`/api/vessel-logs/${logId}/me-performance`)
      .then((r) => {
        setRecord(r);
        if (r.oil_type && !OIL_TYPE_OPTIONS.slice(0, -1).includes(r.oil_type)) {
          setOilTypeOther(r.oil_type);
        }
      })
      .catch(() => setRecord(buildBlankRecord(logId)))
      .finally(() => setLoading(false));
  }, [logId]);

  function setTop(field: keyof MEPerformanceRecord, value: unknown) {
    if (!record) return;
    setRecord({ ...record, [field]: value });
  }

  function setCylinder(idx: number, field: keyof CylinderData, value: unknown) {
    if (!record) return;
    const cyls = [...record.cylinders];
    cyls[idx] = { ...cyls[idx], [field]: value };
    setRecord({ ...record, cylinders: cyls });
  }

  function parseNum(s: string): number | undefined {
    const n = parseFloat(s);
    return isNaN(n) ? undefined : n;
  }

  const specificFeedRate =
    record?.acc_g_kwhxs != null && record?.sulphur_content_pct != null
      ? (record.acc_g_kwhxs * record.sulphur_content_pct).toFixed(3)
      : null;

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    try {
      const result = await api.post<MEPerformanceRecord>(
        `/api/vessel-logs/${logId}/me-performance`,
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

  const tbnChartData = record.cylinders.map((c) => ({
    name: `Cyl ${c.cylinder_number}`,
    tbn: c.tbn_residual ?? null,
  }));

  const feChartData = record.cylinders.map((c) => ({
    name: `Cyl ${c.cylinder_number}`,
    fe: c.fe_ppm ?? null,
  }));

  const hasAnyTbnAnomaly = record.cylinders.some(
    (c) => c.tbn_residual != null && c.tbn_residual < TBN_WARN_THRESHOLD
  );
  const hasAnyFeAnomaly = record.cylinders.some(
    (c) => c.fe_ppm != null && c.fe_ppm >= FE_WARN_THRESHOLD
  );
  const hasDiagnosisData = record.cylinders.some(
    (c) => c.fe_ppm != null || c.tbn_residual != null
  );

  const oilTypeIsCustom = record.oil_type
    ? !OIL_TYPE_OPTIONS.slice(0, -1).includes(record.oil_type)
    : false;
  const oilTypeSelectVal = oilTypeIsCustom && record.oil_type ? "Other" : (record.oil_type || "");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm text-slate-500">
        <Link href={`/vessel-logs/${logId}`} className="hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Log
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Engine Performance</span>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">M/E Scrape-Down Analysis</h1>
          <p className="text-xs text-slate-500 mt-0.5">Weekly cylinder oil condition monitoring</p>
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
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Engine & Oil Parameters</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Record Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={record.record_date || ""}
              onChange={(e) => setTop("record_date", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Chief Engineer</label>
            <input
              list="ce-list"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Name / rank"
              value={record.completed_by}
              onChange={(e) => setTop("completed_by", e.target.value)}
            />
            <datalist id="ce-list">
              <option value="Chief Engineer (CE)" />
              <option value="2nd Engineer (2E)" />
              <option value="3rd Engineer (3E)" />
              <option value="Technical Superintendent" />
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cylinder Oil Type</label>
            <select
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={oilTypeSelectVal}
              onChange={(e) => {
                if (e.target.value === "Other") {
                  setTop("oil_type", oilTypeOther || "");
                } else {
                  setTop("oil_type", e.target.value);
                }
              }}
            >
              <option value="">Select oil type…</option>
              {OIL_TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            {(oilTypeSelectVal === "Other" || oilTypeIsCustom) && (
              <input
                className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter oil type name…"
                value={oilTypeOther}
                onChange={(e) => {
                  setOilTypeOther(e.target.value);
                  setTop("oil_type", e.target.value);
                }}
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">TBN Nominal</label>
            <input
              type="number"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="140"
              value={numField(record.tbn_nominal)}
              onChange={(e) => setTop("tbn_nominal", parseNum(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Engine Run Hours</label>
            <input
              type="number"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="34575"
              value={numField(record.engine_run_hours)}
              onChange={(e) => setTop("engine_run_hours", parseNum(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Shaft Power (kW)</label>
            <input
              type="number"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="7821"
              value={numField(record.shaft_power_kw)}
              onChange={(e) => setTop("shaft_power_kw", parseNum(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Speed (RPM)</label>
            <input
              type="number"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="61"
              value={numField(record.speed_rpm)}
              onChange={(e) => setTop("speed_rpm", parseNum(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Fuel Index</label>
            <input
              type="number"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="69"
              value={numField(record.fuel_index)}
              onChange={(e) => setTop("fuel_index", parseNum(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Sulphur Content (%)</label>
            <input
              type="number"
              step="0.01"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="2.59"
              value={numField(record.sulphur_content_pct)}
              onChange={(e) => setTop("sulphur_content_pct", parseNum(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ACC (g/kWh×S%)</label>
            <input
              type="number"
              step="0.01"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.28"
              value={numField(record.acc_g_kwhxs)}
              onChange={(e) => setTop("acc_g_kwhxs", parseNum(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Min Feed Rate (g/kWh)</label>
            <input
              type="number"
              step="0.01"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1.00"
              value={numField(record.min_feed_rate_g_kwh)}
              onChange={(e) => setTop("min_feed_rate_g_kwh", parseNum(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Specific Feed Rate
              <span className="ml-1 font-normal text-slate-400">(calculated)</span>
            </label>
            <div className="w-full px-3 py-2 border border-slate-100 bg-slate-50 rounded-lg text-sm text-slate-600">
              {specificFeedRate != null ? (
                <span className="font-mono">{specificFeedRate} g/kWh</span>
              ) : (
                <span className="text-slate-400">Enter ACC & Sulphur%</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cylinder data table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Cylinder Scrape-Down Data</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            TBN warn &lt;{TBN_WARN_THRESHOLD} &nbsp;|&nbsp; Fe warn &gt;{FE_WARN_THRESHOLD} ppm &nbsp;|&nbsp; Fe critical &gt;{FE_CRITICAL_THRESHOLD} ppm
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-3 py-2.5 w-16 font-semibold text-slate-500">Cyl</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">TBN Residual</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Fe ppm</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Drain Oil BN</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Liner Wear (mm)</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {record.cylinders.map((cyl, idx) => (
                <tr key={cyl.cylinder_number} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 font-bold text-slate-600">Cyl {cyl.cylinder_number}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.1"
                        className="w-20 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="—"
                        value={numField(cyl.tbn_residual)}
                        onChange={(e) => setCylinder(idx, "tbn_residual", parseNum(e.target.value))}
                      />
                      {cyl.tbn_residual != null && (
                        <span className={`text-xs ${tbnColor(cyl.tbn_residual)}`}>
                          {cyl.tbn_residual < TBN_WARN_THRESHOLD ? "⚠" : "✓"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="1"
                        className="w-20 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="—"
                        value={numField(cyl.fe_ppm)}
                        onChange={(e) => setCylinder(idx, "fe_ppm", parseNum(e.target.value))}
                      />
                      {cyl.fe_ppm != null && (
                        <span className={`text-xs ${feColor(cyl.fe_ppm)}`}>
                          {cyl.fe_ppm >= FE_CRITICAL_THRESHOLD ? "🔴" : cyl.fe_ppm >= FE_WARN_THRESHOLD ? "⚠" : "✓"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.1"
                      className="w-20 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="—"
                      value={numField(cyl.drain_oil_bn)}
                      onChange={(e) => setCylinder(idx, "drain_oil_bn", parseNum(e.target.value))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="—"
                      value={numField(cyl.liner_wear_mm)}
                      onChange={(e) => setCylinder(idx, "liner_wear_mm", parseNum(e.target.value))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="—"
                      value={cyl.remarks || ""}
                      onChange={(e) => setCylinder(idx, "remarks", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Notes</label>
        <textarea
          rows={3}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="e.g. Vessel @ Sea — Sp. Feed rate maintained at 1.00 gm/KW hr"
          value={record.notes || ""}
          onChange={(e) => setTop("notes", e.target.value)}
        />
      </div>

      {/* ─── Analysis Section ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-700">Cylinder Oil Condition Analysis</h2>
          </div>
          {showAnalysis && (
            <button
              onClick={() => setShowAnalysis(false)}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5 rotate-180" />
              Collapse
            </button>
          )}
        </div>

        {!showAnalysis ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-500">
              Run an analysis to view TBN residual trends, Fe ppm distribution, and per-cylinder health diagnosis.
            </p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={analysisFrom}
                  onChange={(e) => setAnalysisFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
                <input
                  type="date"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={analysisTo}
                  onChange={(e) => setAnalysisTo(e.target.value)}
                />
              </div>
              <button
                onClick={() => setShowAnalysis(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Run Analysis
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Anomaly banners */}
            {(hasAnyTbnAnomaly || hasAnyFeAnomaly) && (
              <div className="space-y-2">
                {hasAnyTbnAnomaly && (
                  <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>TBN residual below warning threshold (&lt;{TBN_WARN_THRESHOLD}) in one or more cylinders.</span>
                  </div>
                )}
                {hasAnyFeAnomaly && (
                  <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Elevated Fe ppm (&gt;{FE_WARN_THRESHOLD}) in one or more cylinders. Review lubrication and wear rates.</span>
                  </div>
                )}
              </div>
            )}

            {/* TBN Bar Chart */}
            {tbnChartData.some((d) => d.tbn != null) && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">TBN Residuals by Cylinder</p>
                <p className="text-xs text-slate-400 mb-3">
                  Amber threshold at {TBN_WARN_THRESHOLD} — values below indicate low TBN reserve
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={tbnChartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(val) => [`${val ?? ""}`, "TBN"]}
                    />
                    <ReferenceLine
                      y={TBN_WARN_THRESHOLD}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{ value: `Warn (${TBN_WARN_THRESHOLD})`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }}
                    />
                    <Bar dataKey="tbn" radius={[4, 4, 0, 0]}>
                      {tbnChartData.map((entry, i) => (
                        <Cell key={i} fill={tbnBarColor(entry.tbn)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Fe ppm Bar Chart */}
            {feChartData.some((d) => d.fe != null) && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Fe ppm by Cylinder</p>
                <p className="text-xs text-slate-400 mb-3">
                  Green &lt;200 · Amber ≥200 · Orange ≥500 · Red ≥800 (critical)
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={feChartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(val) => [`${val ?? ""}`, "Fe ppm"]}
                    />
                    <ReferenceLine y={FE_WARN_THRESHOLD} stroke="#f59e0b" strokeDasharray="4 4"
                      label={{ value: `Warn (${FE_WARN_THRESHOLD})`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }} />
                    <ReferenceLine y={FE_CRITICAL_THRESHOLD} stroke="#ef4444" strokeDasharray="4 4"
                      label={{ value: `Critical (${FE_CRITICAL_THRESHOLD})`, position: "insideTopRight", fontSize: 10, fill: "#ef4444" }} />
                    <Bar dataKey="fe" radius={[4, 4, 0, 0]}>
                      {feChartData.map((entry, i) => (
                        <Cell key={i} fill={feBarColor(entry.fe)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Cylinder Diagnosis Cards */}
            {hasDiagnosisData && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">Cylinder Health Diagnosis</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {record.cylinders.map((cyl) => {
                    const { label, color } = cylinderDiagnosis(cyl.fe_ppm, cyl.tbn_residual);
                    return (
                      <div key={cyl.cylinder_number} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <div className="text-xs font-bold text-slate-600 mb-1.5">Cylinder {cyl.cylinder_number}</div>
                        <div className="flex gap-3 text-xs mb-2">
                          <span className="text-slate-500">Fe: <span className={feColor(cyl.fe_ppm)}>{cyl.fe_ppm != null ? `${cyl.fe_ppm} ppm` : "—"}</span></span>
                          <span className="text-slate-500">TBN: <span className={tbnColor(cyl.tbn_residual)}>{cyl.tbn_residual != null ? cyl.tbn_residual : "—"}</span></span>
                        </div>
                        <p className={`text-xs leading-tight ${color}`}>{label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save bottom */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save ME Performance"}
        </button>
      </div>
    </div>
  );
}
