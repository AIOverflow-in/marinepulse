"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CriteriaSet, CriteriaSetDetail } from "@/types";
import { BookOpen, ChevronDown, ChevronRight, Star, Loader2 } from "lucide-react";

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high:     "bg-orange-100 text-orange-700 border-orange-200",
  medium:   "bg-amber-100 text-amber-700 border-amber-200",
  low:      "bg-slate-100 text-slate-500 border-slate-200",
};

const CATEGORY_NAMES: Record<string, string> = {
  A: "Appraisal",
  B: "Planning",
  C: "Execution",
  D: "UKC & Clearance",
  E: "Contingency",
  F: "Reporting",
  G: "Documentation",
  H: "Quality",
};

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wide ${PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.low}`}>
      {priority}
    </span>
  );
}

function CriteriaTable({ detail }: { detail: CriteriaSetDetail }) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(["A"]));

  function toggle(cat: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  // Group criteria by category
  const byCategory: Record<string, typeof detail.criteria> = {};
  for (const c of detail.criteria) {
    (byCategory[c.category] ??= []).push(c);
  }

  return (
    <div className="mt-4 space-y-2">
      {Object.entries(byCategory).map(([cat, items]) => {
        const open = openCategories.has(cat);
        const catName = CATEGORY_NAMES[cat] ?? cat;
        const criticalCount = items.filter((i) => i.priority === "critical").length;
        return (
          <div key={cat} className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggle(cat)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <span className="font-semibold text-slate-700 text-sm">{cat} — {catName}</span>
                <span className="text-xs text-slate-400">{items.length} criteria</span>
                {criticalCount > 0 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                    {criticalCount} critical
                  </span>
                )}
              </div>
            </button>
            {open && (
              <div className="divide-y divide-slate-100">
                {items.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-mono font-bold text-slate-400 w-8 flex-shrink-0">{c.id}</span>
                    <span className="text-sm text-slate-700 flex-1">{c.label}</span>
                    <PriorityBadge priority={c.priority} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CriteriaSetsPage() {
  const [sets, setSets] = useState<CriteriaSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CriteriaSetDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api.get<CriteriaSet[]>("/api/criteria-sets").then((data) => {
      setSets(data);
      if (data.length > 0) {
        const def = data.find((s) => s.is_default) ?? data[0];
        handleSelect(def.id);
      }
    }).finally(() => setLoading(false));
  }, []);

  async function handleSelect(id: string) {
    setSelected(id);
    setLoadingDetail(true);
    try {
      const d = await api.get<CriteriaSetDetail>(`/api/criteria-sets/${id}`);
      setDetail(d);
    } finally {
      setLoadingDetail(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Criteria Sets</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Evaluation frameworks used to analyse passage plans
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: set list */}
        <div className="space-y-2">
          {sets.map((cs) => (
            <button
              key={cs.id}
              onClick={() => handleSelect(cs.id)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                selected === cs.id
                  ? "bg-blue-50 border-blue-300 shadow-sm"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <BookOpen className={`w-4 h-4 flex-shrink-0 ${selected === cs.id ? "text-blue-600" : "text-slate-400"}`} />
                  <span className={`text-sm font-semibold ${selected === cs.id ? "text-blue-800" : "text-slate-700"}`}>
                    {cs.name}
                  </span>
                </div>
                {cs.is_default && (
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0 mt-0.5" />
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 pl-5">
                <span className="text-xs text-slate-400">{cs.criteria_count} criteria</span>
                {cs.company_id === null && (
                  <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 rounded px-1.5 py-0.5 font-medium">
                    Global
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Right: criteria detail */}
        <div className="lg:col-span-2">
          {loadingDetail ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : detail ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{detail.name}</h2>
                  {detail.description && (
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">{detail.description}</p>
                  )}
                </div>
                {detail.is_default && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                    Default
                  </span>
                )}
              </div>

              {/* Priority summary */}
              <div className="mt-4 flex flex-wrap gap-2">
                {(["critical", "high", "medium", "low"] as const).map((p) => {
                  const count = detail.criteria.filter((c) => c.priority === p).length;
                  if (!count) return null;
                  return (
                    <span key={p} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${PRIORITY_STYLES[p]}`}>
                      {count} {p}
                    </span>
                  );
                })}
              </div>

              <CriteriaTable detail={detail} />
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              Select a criteria set to view its contents
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
