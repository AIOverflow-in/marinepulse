"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { SafetyCheckRecord, WeeklyCheckItem, PeriodicCheckItem } from "@/types";
import { ArrowLeft, Loader2, Save, CheckCircle2 } from "lucide-react";

export default function SafetyChecksPage() {
  const { logId } = useParams<{ logId: string }>();
  const [record, setRecord] = useState<SafetyCheckRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<SafetyCheckRecord>(`/api/vessel-logs/${logId}/safety-checks`)
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logId]);

  function setWeeklyItem(idx: number, field: keyof WeeklyCheckItem, value: unknown) {
    if (!record) return;
    const items = [...record.week_items];
    items[idx] = { ...items[idx], [field]: value };
    setRecord({ ...record, week_items: items });
  }

  function setPeriodicItem(
    section: "monthly_items" | "quarterly_items",
    idx: number,
    field: keyof PeriodicCheckItem,
    value: unknown
  ) {
    if (!record) return;
    const items = [...record[section]];
    items[idx] = { ...items[idx], [field]: value };
    setRecord({ ...record, [section]: items });
  }

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    try {
      const result = await api.post<SafetyCheckRecord>(
        `/api/vessel-logs/${logId}/safety-checks`,
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm text-slate-500">
        <Link href={`/vessel-logs/${logId}`} className="hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Log
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Safety System Checks</span>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Safety System Checks</h1>
          <p className="text-xs text-slate-500 mt-0.5">GM 2.10.7 A3 — Regular testing of safety system and critical equipment</p>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Position</label>
          <input
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. AT SEA"
            value={record.position}
            onChange={(e) => setRecord({ ...record, position: e.target.value })}
          />
        </div>
      </div>

      {/* Section 1: Weekly Tests */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">1. Weekly Tests</h2>
          <p className="text-xs text-slate-400 mt-0.5">Tick only if tested satisfactory</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-3 py-2 w-8 font-semibold text-slate-500">Code</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Description</th>
                {["W1","W2","W3","W4","W5"].map((w) => (
                  <th key={w} className="px-2 py-2 w-10 text-center font-semibold text-slate-500">{w}</th>
                ))}
                <th className="text-left px-3 py-2 w-24 font-semibold text-slate-500">Initials</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {record.week_items.map((item, idx) => (
                <tr key={item.item_code} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 font-bold text-slate-600">{item.item_code}</td>
                  <td className="px-3 py-2 text-slate-700 leading-snug">{item.description}</td>
                  {(["w1","w2","w3","w4","w5"] as const).map((wk) => (
                    <td key={wk} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={item[wk]}
                        onChange={(e) => setWeeklyItem(idx, wk, e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <input
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={item.initials || ""}
                      onChange={(e) => setWeeklyItem(idx, "initials", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={item.remarks || ""}
                      onChange={(e) => setWeeklyItem(idx, "remarks", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Monthly Tests */}
      <PeriodicSection
        title="2. Monthly Tests"
        items={record.monthly_items}
        onChange={(idx, field, val) => setPeriodicItem("monthly_items", idx, field, val)}
      />

      {/* Section 3: Quarterly Tests */}
      <PeriodicSection
        title="3. Quarterly Tests (3 Monthly)"
        items={record.quarterly_items}
        onChange={(idx, field, val) => setPeriodicItem("quarterly_items", idx, field, val)}
      />

      {/* Save bottom */}
      <div className="flex justify-end mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save Safety Checks"}
        </button>
      </div>
    </div>
  );
}

function PeriodicSection({
  title,
  items,
  onChange,
}: {
  title: string;
  items: PeriodicCheckItem[];
  onChange: (idx: number, field: keyof PeriodicCheckItem, value: unknown) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="text-left px-3 py-2 w-8 font-semibold text-slate-500">Code</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-500">Description</th>
              <th className="text-left px-3 py-2 w-36 font-semibold text-slate-500">Date of Test</th>
              <th className="text-left px-3 py-2 w-24 font-semibold text-slate-500">Initials</th>
              <th className="text-left px-3 py-2 w-20 text-center font-semibold text-slate-500">N/A</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-500">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <tr key={item.item_code} className={`hover:bg-slate-50/50 ${item.not_applicable ? "opacity-50" : ""}`}>
                <td className="px-3 py-2 font-bold text-slate-600">{item.item_code}</td>
                <td className="px-3 py-2 text-slate-700 leading-snug">{item.description}</td>
                <td className="px-3 py-2">
                  <input
                    type="date"
                    disabled={item.not_applicable}
                    className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50"
                    value={item.test_date || ""}
                    onChange={(e) => onChange(idx, "test_date", e.target.value || null)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    disabled={item.not_applicable}
                    className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50"
                    value={item.initials || ""}
                    onChange={(e) => onChange(idx, "initials", e.target.value)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={item.not_applicable || false}
                    onChange={(e) => onChange(idx, "not_applicable", e.target.checked)}
                    className="w-4 h-4 accent-slate-500 cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    disabled={item.not_applicable}
                    className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50"
                    value={item.remarks || ""}
                    onChange={(e) => onChange(idx, "remarks", e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
