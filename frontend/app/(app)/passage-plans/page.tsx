"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CriteriaSet, CriteriaSetDetail, PassagePlanAnalysis } from "@/types";
import {
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  ChevronRight,
  Ship,
  MapPin,
  X,
  BookOpen,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

function gradeFromScore(score: number) {
  if (score >= 80) return { grade: "A", color: "text-emerald-600" };
  if (score >= 65) return { grade: "B", color: "text-lime-600" };
  if (score >= 50) return { grade: "C", color: "text-amber-600" };
  if (score >= 35) return { grade: "D", color: "text-orange-600" };
  return { grade: "F", color: "text-red-600" };
}

function StatusBadge({ status }: { status: PassagePlanAnalysis["status"] }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        <FileText className="w-3 h-3" />
        No PDF
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <Loader2 className="w-3 h-3 animate-spin" />
        Analyzing…
      </span>
    );
  }
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-3 h-3" />
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" />
      Failed
    </span>
  );
}

// ─── New Plan Modal ────────────────────────────────────────────────────────────

function NewPlanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (plan: PassagePlanAnalysis) => void;
}) {
  const [form, setForm] = useState({
    vessel_name: "",
    voyage_number: "",
    from_port: "",
    to_port: "",
    voyage_date: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const plan = await api.post<PassagePlanAnalysis>("/api/passage-plans", form);
      onCreated(plan);
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">New Passage Plan</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Vessel Name
              </label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. M/T Star Eagle"
                value={form.vessel_name}
                onChange={(e) => setForm({ ...form, vessel_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Voyage Number
              </label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 11L"
                value={form.voyage_number}
                onChange={(e) => setForm({ ...form, voyage_number: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                From Port
              </label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Daesan"
                value={form.from_port}
                onChange={(e) => setForm({ ...form, from_port: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                To Port
              </label>
              <input
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Singapore"
                value={form.to_port}
                onChange={(e) => setForm({ ...form, to_port: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Voyage Date
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.voyage_date}
              onChange={(e) => setForm({ ...form, voyage_date: e.target.value })}
            />
          </div>
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
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating…" : "Create Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  plan,
  onClose,
  onUploaded,
}: {
  plan: PassagePlanAnalysis;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [criteriaSets, setCriteriaSets] = useState<CriteriaSet[]>([]);
  const [selectedCriteriaSetId, setSelectedCriteriaSetId] = useState<string>("");
  const [criteriaDetail, setCriteriaDetail] = useState<CriteriaSetDetail | null>(null);
  const [showCriteria, setShowCriteria] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get<CriteriaSet[]>("/api/criteria-sets").then((sets) => {
      setCriteriaSets(sets);
      const def = sets.find((s) => s.is_default) ?? sets[0];
      if (def) {
        setSelectedCriteriaSetId(def.id);
        api.get<CriteriaSetDetail>(`/api/criteria-sets/${def.id}`).then(setCriteriaDetail).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  function handleCriteriaSetChange(id: string) {
    setSelectedCriteriaSetId(id);
    setCriteriaDetail(null);
    setShowCriteria(false);
    api.get<CriteriaSetDetail>(`/api/criteria-sets/${id}`).then(setCriteriaDetail).catch(() => {});
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (selectedCriteriaSetId) fd.append("criteria_set_id", selectedCriteriaSetId);
      await api.upload(`/api/passage-plans/${plan.id}/upload`, fd);
      onUploaded();
      onClose();
    } catch (err: unknown) {
      alert((err as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Upload Passage Plan PDF</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Voyage summary */}
          {(plan.vessel_name || plan.from_port) && (
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
              <span className="font-medium">{plan.vessel_name || "Unnamed vessel"}</span>
              {plan.from_port && plan.to_port && (
                <span className="text-slate-400 ml-2">{plan.from_port} → {plan.to_port}</span>
              )}
            </div>
          )}

          {/* Criteria set */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              Criteria Set
            </label>
            <select
              value={selectedCriteriaSetId}
              onChange={(e) => handleCriteriaSetChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {criteriaSets.length === 0 && <option value="">Loading…</option>}
              {criteriaSets.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {cs.name} ({cs.criteria_count} criteria){cs.is_default ? " ★ Default" : ""}
                </option>
              ))}
            </select>

            {/* View criteria inline toggle */}
            {criteriaDetail && (
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() => setShowCriteria((v) => !v)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showCriteria ? "rotate-180" : ""}`} />
                  {showCriteria ? "Hide" : "View"} {criteriaDetail.criteria_count} criteria
                </button>

                {showCriteria && (
                  <div className="mt-2 max-h-52 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 text-xs">
                    {Object.entries(
                      criteriaDetail.criteria.reduce<Record<string, typeof criteriaDetail.criteria>>((acc, c) => {
                        (acc[c.category] ??= []).push(c);
                        return acc;
                      }, {})
                    ).map(([cat, items]) => (
                      <div key={cat}>
                        <div className="px-3 py-1.5 bg-slate-100 font-semibold text-slate-600 sticky top-0">
                          {cat} — {{"A":"Appraisal","B":"Planning","C":"Execution","D":"UKC & Clearance","E":"Contingency","F":"Reporting","G":"Documentation","H":"Quality"}[cat] ?? cat}
                        </div>
                        {items.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 last:border-0">
                            <span className="font-mono text-slate-400 w-6 flex-shrink-0">{c.id}</span>
                            <span className="flex-1 text-slate-600">{c.label}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                              c.priority === "critical" ? "bg-red-100 text-red-700 border-red-200" :
                              c.priority === "high" ? "bg-orange-100 text-orange-700 border-orange-200" :
                              c.priority === "medium" ? "bg-amber-100 text-amber-700 border-amber-200" :
                              "bg-slate-100 text-slate-500 border-slate-200"
                            }`}>{c.priority}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="p-2 text-center border-t border-slate-200">
                      <a href="/criteria-sets" target="_blank" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
                        Open full view <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* File trigger */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !selectedCriteriaSetId}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
            ) : (
              <><Upload className="w-4 h-4" /> Select PDF &amp; Start Analysis</>
            )}
          </button>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
        </div>
      </div>
    </div>
  );
}

// ─── Upload cell per row ──────────────────────────────────────────────────────

function UploadCell({
  plan,
  onUploaded,
}: {
  plan: PassagePlanAnalysis;
  onUploaded: () => void;
}) {
  const [showModal, setShowModal] = useState(false);

  if (plan.status === "complete") {
    return (
      <div className="flex items-center gap-2">
        <Link
          href={`/passage-plans/${plan.id}`}
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
        >
          View Scorecard
          <ChevronRight className="w-3 h-3" />
        </Link>
        <button
          onClick={() => setShowModal(true)}
          className="text-xs text-slate-400 hover:text-slate-600"
          title="Re-upload PDF"
        >
          <Upload className="w-3 h-3" />
        </button>
        {showModal && (
          <UploadModal
            plan={plan}
            onClose={() => setShowModal(false)}
            onUploaded={() => { onUploaded(); setShowModal(false); }}
          />
        )}
      </div>
    );
  }

  if (plan.status === "processing") {
    return <span className="text-xs text-slate-400">Analyzing…</span>;
  }

  if (plan.status === "failed") {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-800 font-medium"
        >
          <Upload className="w-3 h-3" />
          Re-upload
        </button>
        {showModal && (
          <UploadModal
            plan={plan}
            onClose={() => setShowModal(false)}
            onUploaded={() => { onUploaded(); setShowModal(false); }}
          />
        )}
      </>
    );
  }

  // pending
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-medium transition-colors"
      >
        <Upload className="w-3 h-3" />
        Upload PDF
      </button>
      {showModal && (
        <UploadModal
          plan={plan}
          onClose={() => setShowModal(false)}
          onUploaded={() => { onUploaded(); setShowModal(false); }}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PassagePlansPage() {
  const [plans, setPlans] = useState<PassagePlanAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchList() {
    try {
      const data = await api.get<{ items: PassagePlanAnalysis[] }>("/api/passage-plans");
      setPlans(data.items);
      return data.items;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }

  function startPollingIfNeeded(items: PassagePlanAnalysis[]) {
    const anyProcessing = items.some((p) => p.status === "processing");
    if (anyProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const updated = await fetchList();
        if (!updated.some((p) => p.status === "processing")) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        }
      }, 5000);
    }
  }

  useEffect(() => {
    fetchList().then(startPollingIfNeeded);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  function handleCreated(plan: PassagePlanAnalysis) {
    setPlans((prev) => [plan, ...prev]);
    setShowModal(false);
  }

  function formatDate(iso?: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {showModal && (
        <NewPlanModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Passage Plans</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Create a plan record, then upload its PDF to run an 80-criteria SIRE analysis
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Passage Plan
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
          <Ship className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No passage plans yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Create a plan record and upload the PDF to analyse it
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Passage Plan
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vessel / Voyage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Route</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Score</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Critical Gaps</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map((plan) => {
                const { grade, color } = gradeFromScore(plan.overall_score);
                return (
                  <tr key={plan.id} className="hover:bg-slate-50 transition-colors">
                    {/* Vessel / Voyage */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Ship className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-slate-800">
                            {plan.vessel_name || <span className="text-slate-400 italic">No vessel</span>}
                          </div>
                          {plan.voyage_number && (
                            <div className="text-xs text-slate-400">Voyage {plan.voyage_number}</div>
                          )}
                          {plan.filename && (
                            <div className="text-xs text-slate-400 truncate max-w-[160px]">{plan.filename}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Route */}
                    <td className="px-4 py-3">
                      {plan.from_port || plan.to_port ? (
                        <div className="flex items-center gap-1 text-slate-600 text-xs">
                          <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span>{plan.from_port || "—"}</span>
                          <span className="text-slate-400">→</span>
                          <span>{plan.to_port || "—"}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    {/* Date */}
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {formatDate(plan.voyage_date)}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={plan.status} />
                    </td>
                    {/* Score */}
                    <td className="px-4 py-3">
                      {plan.status === "complete" ? (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base font-bold text-slate-800">
                            {plan.overall_score.toFixed(1)}%
                          </span>
                          <span className={`text-xs font-bold ${color}`}>{grade}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    {/* Critical Gaps */}
                    <td className="px-4 py-3">
                      {plan.status === "complete" ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            plan.critical_gaps > 0
                              ? PRIORITY_COLORS.critical
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {plan.critical_gaps === 0
                            ? "None"
                            : `${plan.critical_gaps} gap${plan.critical_gaps > 1 ? "s" : ""}`}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    {/* Action */}
                    <td className="px-4 py-3">
                      <UploadCell
                        plan={plan}
                        onUploaded={() => {
                          fetchList().then(startPollingIfNeeded);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
