"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CriterionResult, PassagePlanAnalysis } from "@/types";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  FileText,
  Loader2,
  Shield,
  BookOpen,
  Download,
} from "lucide-react";

// ─── constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  A: "A — Appraisal",
  B: "B — Planning",
  C: "C — Execution",
  D: "D — UKC & Clearance",
  E: "E — Contingency",
  F: "F — Reporting",
  G: "G — Documentation",
  H: "H — Quality",
};

const PRIORITY_CONFIG: Record<
  string,
  { label: string; badgeClass: string; dotClass: string }
> = {
  critical: {
    label: "Critical",
    badgeClass: "bg-red-100 text-red-700 border border-red-200",
    dotClass: "bg-red-500",
  },
  high: {
    label: "High",
    badgeClass: "bg-orange-100 text-orange-700 border border-orange-200",
    dotClass: "bg-orange-500",
  },
  medium: {
    label: "Medium",
    badgeClass: "bg-amber-100 text-amber-700 border border-amber-200",
    dotClass: "bg-amber-400",
  },
  low: {
    label: "Low",
    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
    dotClass: "bg-slate-400",
  },
};

type PriorityFilter = "all" | "critical" | "high" | "medium" | "low";
type StatusFilter = "all" | "missing" | "present";

function gradeFromScore(score: number) {
  if (score >= 80) return { grade: "A", bg: "bg-emerald-500", text: "text-emerald-600" };
  if (score >= 65) return { grade: "B", bg: "bg-lime-500", text: "text-lime-600" };
  if (score >= 50) return { grade: "C", bg: "bg-amber-500", text: "text-amber-600" };
  if (score >= 35) return { grade: "D", bg: "bg-orange-500", text: "text-orange-600" };
  return { grade: "F", bg: "bg-red-500", text: "text-red-600" };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function CriterionRow({ result }: { result: CriterionResult }) {
  const [expanded, setExpanded] = useState(false);
  const pc = PRIORITY_CONFIG[result.priority ?? "medium"];
  const isMissing = result.present === 0;

  return (
    <div
      className={`border-b border-slate-100 last:border-0 ${
        isMissing ? "bg-red-50/40" : ""
      }`}
    >
      <button
        onClick={() => isMissing && setExpanded((v) => !v)}
        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 group ${
          isMissing ? "hover:bg-red-50 cursor-pointer" : "cursor-default"
        }`}
      >
        {/* present/missing icon */}
        {isMissing ? (
          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        )}

        {/* ID */}
        <span className="text-xs font-mono font-semibold text-slate-500 w-7 flex-shrink-0">
          {result.id}
        </span>

        {/* Label */}
        <span
          className={`flex-1 text-sm ${
            isMissing ? "text-slate-800 font-medium" : "text-slate-600"
          }`}
        >
          {result.label}
        </span>

        {/* Priority badge */}
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${pc.badgeClass}`}
        >
          {pc.label}
        </span>

        {/* Confidence */}
        <span className="text-xs text-slate-400 flex-shrink-0 w-14 text-right">
          {result.confidence}
        </span>

        {/* Expand chevron for missing items */}
        {isMissing && (
          <span className="text-slate-400 flex-shrink-0">
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </span>
        )}
      </button>

      {/* Expanded gap details */}
      {isMissing && expanded && (
        <div className="px-12 pb-3 space-y-2">
          {result.observation && (
            <div className="flex gap-2 text-sm">
              <FileText className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-slate-700">Observation: </span>
                <span className="text-slate-600">{result.observation}</span>
              </div>
            </div>
          )}
          {result.risk && (
            <div className="flex gap-2 text-sm">
              <Shield className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-slate-700">Risk: </span>
                <span className="text-red-700">{result.risk}</span>
              </div>
            </div>
          )}
          {result.reference && (
            <div className="flex gap-2 text-sm">
              <BookOpen className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-slate-700">Reference: </span>
                <span className="text-blue-700">{result.reference}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  category,
  results,
}: {
  category: string;
  results: CriterionResult[];
}) {
  const [open, setOpen] = useState(true);
  const passed = results.filter((r) => r.present === 1).length;
  const total = results.length;
  const allPassed = passed === total;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <span className="font-semibold text-slate-800 flex-1 text-left">
          {CATEGORY_LABELS[category] ?? category}
        </span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            allPassed
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {passed}/{total} passed
        </span>
      </button>
      {open && (
        <div>
          {results.map((r) => (
            <CriterionRow key={r.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function PassagePlanDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [analysis, setAnalysis] = useState<PassagePlanAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");

  useEffect(() => {
    api
      .get<PassagePlanAnalysis>(`/api/passage-plans/${id}`)
      .then(setAnalysis)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-6 text-center text-slate-500">Analysis not found.</div>
    );
  }

  const { grade, bg, text } = gradeFromScore(analysis.overall_score);

  // Apply filters
  const filteredResults = analysis.results.filter((r) => {
    if (statusFilter === "missing" && r.present !== 0) return false;
    if (statusFilter === "present" && r.present !== 1) return false;
    if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
    return true;
  });

  // Group by category
  const grouped: Record<string, CriterionResult[]> = {};
  for (const r of filteredResults) {
    const cat = r.category ?? "?";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  }

  const criticalMissing = analysis.results.filter(
    (r) => r.present === 0 && r.priority === "critical"
  );
  const highMissing = analysis.results.filter(
    (r) => r.present === 0 && r.priority === "high"
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/passage-plans"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        All Analyses
      </Link>

      {/* Title */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 truncate">
            {analysis.filename}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Analysed on{" "}
            {new Date(analysis.created_at).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {analysis.has_file && (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/passage-plans/${analysis.id}/file`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <Download className="w-4 h-4" />
            View Original PDF
          </a>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Overall score */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-xs text-slate-500 mb-1">Overall Score</div>
          <div className="text-3xl font-bold text-slate-900">
            {analysis.overall_score.toFixed(1)}%
          </div>
          <div className={`text-sm font-bold mt-1 ${text}`}>Grade {grade}</div>
        </div>

        {/* Criteria met */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-xs text-slate-500 mb-1">Criteria Met</div>
          <div className="text-3xl font-bold text-slate-900">
            {analysis.criteria_met}
            <span className="text-lg text-slate-400">/{analysis.total_criteria}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">of 80 criteria</div>
        </div>

        {/* Critical gaps */}
        <div
          className={`rounded-xl border p-4 text-center ${
            analysis.critical_gaps > 0
              ? "bg-red-50 border-red-200"
              : "bg-emerald-50 border-emerald-200"
          }`}
        >
          <div className="text-xs text-slate-500 mb-1">Critical Gaps</div>
          <div
            className={`text-3xl font-bold ${
              analysis.critical_gaps > 0 ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {analysis.critical_gaps}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {analysis.critical_gaps === 0 ? "All critical met" : "Requires action"}
          </div>
        </div>

        {/* High priority gaps */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-xs text-slate-500 mb-1">High Priority Gaps</div>
          <div
            className={`text-3xl font-bold ${
              highMissing.length > 0 ? "text-orange-600" : "text-slate-700"
            }`}
          >
            {highMissing.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">of 21 high-priority</div>
        </div>
      </div>

      {/* Score bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>0%</span>
          <span className="font-medium text-slate-700">
            {analysis.overall_score.toFixed(1)}%
          </span>
          <span>100%</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${bg}`}
            style={{ width: `${analysis.overall_score}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1.5">
          <span className="text-red-500 font-medium">F &lt;35%</span>
          <span className="text-orange-500 font-medium">D 35%</span>
          <span className="text-amber-500 font-medium">C 50%</span>
          <span className="text-lime-600 font-medium">B 65%</span>
          <span className="text-emerald-600 font-medium">A 80%</span>
        </div>
      </div>

      {/* Critical gaps callout */}
      {criticalMissing.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-800">
              {criticalMissing.length} Critical Gap{criticalMissing.length > 1 ? "s" : ""} — Immediate Attention Required
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {criticalMissing.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-red-200 rounded-lg text-xs font-medium text-red-700"
              >
                <span className="font-mono">{r.id}</span>
                <span className="text-red-500">·</span>
                {r.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {(["all", "missing", "present"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === f
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f === "all" ? "All" : f === "missing" ? "Missing Only" : "Passed Only"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {(["all", "critical", "high", "medium", "low"] as PriorityFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                priorityFilter === p
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p === "all" ? "All Priorities" : p}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-400 ml-auto">
          Showing {filteredResults.length} of {analysis.results.length} criteria
        </span>
      </div>

      {/* Category sections */}
      {Object.keys(CATEGORY_LABELS)
        .filter((cat) => grouped[cat] && grouped[cat].length > 0)
        .map((cat) => (
          <CategorySection key={cat} category={cat} results={grouped[cat]} />
        ))}

      {filteredResults.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          No criteria match the selected filters.
        </div>
      )}
    </div>
  );
}
