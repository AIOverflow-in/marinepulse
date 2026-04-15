"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Inspection, InspectionScore } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, ArrowLeft, Save, Send, Loader2, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface AuditScoreResult {
  total_subjects: number;
  total_assessed: number;
  total_ns: number;
  max_score: number;
  total_score: number;
  average: number;
  percentage: number;
}

function computeAuditScore(scores: Record<string, { score: number | string | null; weight: number }>): AuditScoreResult {
  const all = Object.values(scores);
  const numeric = all.filter((s) => typeof s.score === "number") as { score: number; weight: number }[];
  const nsCount = all.filter((s) => s.score === "NS").length;
  const totalAssessed = numeric.length;
  const maxScore = totalAssessed * 5;
  const totalScore = numeric.reduce((sum, s) => sum + s.score, 0);
  return {
    total_subjects: all.length,
    total_assessed: totalAssessed,
    total_ns: nsCount,
    max_score: maxScore,
    total_score: totalScore,
    average: totalAssessed > 0 ? Math.round((totalScore / totalAssessed) * 100) / 100 : 0,
    percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 1000) / 10 : 0,
  };
}

const SCORE_COLORS: Record<number | string, string> = {
  0: "bg-red-700",
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-amber-400",
  4: "bg-lime-500",
  5: "bg-emerald-500",
  NS: "bg-slate-400",
};

const SCORE_LABELS: Record<number | string, string> = {
  0: "Hazard",
  1: "Non-existent",
  2: "Poor",
  3: "Fair",
  4: "Good",
  5: "Excellent",
  NS: "Not Sighted",
};

function ScoreButton({ value, selected, onClick }: { value: number | string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={SCORE_LABELS[value]}
      className={cn(
        "h-9 px-3 rounded-lg text-xs font-bold transition-all border-2 flex-shrink-0 min-w-[36px]",
        selected
          ? `${SCORE_COLORS[value]} text-white border-transparent shadow-sm scale-105`
          : "bg-slate-100 text-slate-500 border-transparent hover:bg-slate-200 hover:text-slate-700"
      )}
    >
      {value}
    </button>
  );
}

type LocalScore = { score: number | string | null; comment: string; evidence_urls: string[]; weight: number };

export default function ScoringPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [scores, setScores] = useState<InspectionScore[]>([]);
  const [localScores, setLocalScores] = useState<Record<string, LocalScore>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [liveScore, setLiveScore] = useState<AuditScoreResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [expandedGuidance, setExpandedGuidance] = useState<Record<string, boolean>>({});
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    Promise.all([
      api.get<Inspection>(`/api/inspections/${id}`),
      api.get<InspectionScore[]>(`/api/inspections/${id}/scores`),
    ]).then(([insp, sc]) => {
      setInspection(insp);
      setScores(sc);
      const initial: Record<string, LocalScore> = {};
      sc.forEach((s) => {
        initial[s.checklist_item_id] = {
          score: s.score,
          comment: s.comment || "",
          evidence_urls: s.evidence_urls,
          weight: s.weight,
        };
      });
      setLocalScores(initial);
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    setLiveScore(computeAuditScore(localScores));
  }, [localScores]);

  const saveDraft = useCallback(async (showFeedback = true) => {
    setSaving(true);
    if (showFeedback) setSaveStatus("saving");
    try {
      const payload = Object.entries(localScores).map(([itemId, data]) => ({
        checklist_item_id: itemId,
        score: data.score,
        comment: data.comment || null,
        evidence_urls: data.evidence_urls,
      }));
      await api.post(`/api/inspections/${id}/scores`, payload);
      if (showFeedback) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } finally {
      setSaving(false);
    }
  }, [localScores, id]);

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { saveDraft(true); }, 3000);
  }, [saveDraft]);

  const setScore = (itemId: string, value: number | string) => {
    setLocalScores((prev) => ({ ...prev, [itemId]: { ...prev[itemId], score: value } }));
    triggerAutoSave();
  };

  const setComment = (itemId: string, value: string) => {
    setLocalScores((prev) => ({ ...prev, [itemId]: { ...prev[itemId], comment: value } }));
    triggerAutoSave();
  };

  const addEvidence = (itemId: string, url: string) => {
    if (!url.trim()) return;
    setLocalScores((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], evidence_urls: [...(prev[itemId]?.evidence_urls || []), url] },
    }));
    triggerAutoSave();
  };

  const handleSubmit = async () => {
    const unscored = Object.values(localScores).filter((s) => s.score === null).length;
    if (unscored > 0) {
      alert(`${unscored} items have not been scored yet. Score or mark as NS.`);
      return;
    }
    setSubmitting(true);
    try {
      await saveDraft(false);
      await api.post(`/api/inspections/${id}/submit`, {});
      router.push(`/inspections/${id}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading inspection…</div>;
  if (!inspection) return <div className="p-6 text-slate-500">Not found</div>;

  // Group by assessment_type + category to avoid collisions (Passage Planning exists in both static & dynamic)
  const groups: Record<string, { label: string; assessmentType: string; items: InspectionScore[] }> = {};
  scores.forEach((s) => {
    const key = `${s.assessment_type || "static"}:${s.category}`;
    if (!groups[key]) {
      groups[key] = {
        label: s.category,
        assessmentType: s.assessment_type || "static",
        items: [],
      };
    }
    groups[key].items.push(s);
  });

  const totalItems = scores.length;
  const scoredItems = Object.values(localScores).filter((s) => s.score !== null).length;
  const progress = totalItems > 0 ? (scoredItems / totalItems) * 100 : 0;
  const defCount = Object.values(localScores).filter((s) => typeof s.score === "number" && s.score < 3).length;
  const nsCount = liveScore?.total_ns ?? 0;

  const scoreColor = !liveScore || liveScore.percentage === 0
    ? "text-slate-400"
    : liveScore.percentage >= 80 ? "text-emerald-600"
    : liveScore.percentage >= 65 ? "text-blue-600"
    : liveScore.percentage >= 50 ? "text-amber-600"
    : "text-red-600";

  const scrollToCategory = (key: string) => {
    categoryRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Group nav items by assessment type
  const staticGroups = Object.entries(groups).filter(([, g]) => g.assessmentType === "static");
  const dynamicGroups = Object.entries(groups).filter(([, g]) => g.assessmentType === "dynamic");

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left category nav */}
      <div className="w-52 flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto py-3">
        {[
          { label: "STATIC", groups: staticGroups },
          { label: "DYNAMIC", groups: dynamicGroups },
        ].map(({ label, groups: grps }) => (
          <div key={label} className="mb-2">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-4 py-1.5">{label}</p>
            {grps.map(([key, group]) => {
              const catScored = group.items.filter(i => localScores[i.checklist_item_id]?.score !== null).length;
              const catDef = group.items.filter(i => {
                const s = localScores[i.checklist_item_id]?.score;
                return typeof s === "number" && s < 3;
              }).length;
              const allDone = catScored === group.items.length;
              return (
                <button
                  key={key}
                  onClick={() => scrollToCategory(key)}
                  className="w-full text-left px-4 py-1.5 hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-slate-600 group-hover:text-slate-900 truncate leading-tight">{group.label}</span>
                    <span className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      catDef > 0 ? "bg-red-400" :
                      allDone ? "bg-emerald-400" :
                      catScored > 0 ? "bg-blue-400" : "bg-slate-300"
                    )} />
                  </div>
                  <p className="text-[10px] text-slate-400 tabular-nums">{catScored}/{group.items.length}</p>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sticky header */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-white">
          <div className="h-1 bg-slate-100">
            <div className="h-1 bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between px-5 py-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-slate-800">Score Inspection</h1>
                <p className="text-xs text-slate-400 truncate">
                  {inspection.port} · {format(new Date(inspection.inspection_date), "d MMM yyyy")} · {scoredItems}/{totalItems} scored
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Live score */}
              {liveScore && liveScore.percentage > 0 && (
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">Live Score</div>
                  <div className={`text-base font-bold tabular-nums leading-tight ${scoreColor}`}>
                    {liveScore.percentage}% <span className="text-xs font-medium text-slate-400">({liveScore.average}/5 avg)</span>
                  </div>
                </div>
              )}
              {defCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full ring-1 ring-red-200">
                  <AlertTriangle className="w-3 h-3" />{defCount}
                </span>
              )}
              {nsCount > 0 && (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  NS: {nsCount}
                </span>
              )}
              {saveStatus === "saving" && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Saved
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => saveDraft()} disabled={saving} className="h-7 text-xs">
                <Save className="w-3.5 h-3.5 mr-1" />
                Save Draft
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting} className="h-7 text-xs bg-blue-600 hover:bg-blue-700">
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable checklist */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-8">
            {[
              { sectionLabel: "Static Assessment", groups: staticGroups },
              { sectionLabel: "Dynamic Assessment", groups: dynamicGroups },
            ].map(({ sectionLabel, groups: grps }) => (
              <div key={sectionLabel}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{sectionLabel}</h2>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <div className="space-y-6">
                  {grps.map(([key, group]) => (
                    <div
                      key={key}
                      ref={(el) => { categoryRefs.current[key] = el; }}
                      className="scroll-mt-4"
                    >
                      {/* Category header */}
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-sm font-semibold text-slate-800">{group.label}</h3>
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-xs text-slate-400 tabular-nums">
                          {group.items.filter(i => localScores[i.checklist_item_id]?.score !== null).length}/{group.items.length}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="space-y-2">
                        {group.items.map((item) => {
                          const local = localScores[item.checklist_item_id] || { score: null, comment: "", evidence_urls: [], weight: item.weight };
                          const isDeficiency = typeof local.score === "number" && local.score < 3;
                          const isNS = local.score === "NS";
                          const hasGuidance = !!(item as any).guidance_note;
                          const guidanceKey = item.checklist_item_id;
                          const guidanceOpen = expandedGuidance[guidanceKey] ?? false;

                          return (
                            <div
                              key={item.checklist_item_id}
                              className={cn(
                                "rounded-lg border p-3.5 transition-colors",
                                isDeficiency
                                  ? "border-red-200 bg-red-50/50"
                                  : isNS
                                  ? "border-slate-200 bg-slate-50/50 opacity-70"
                                  : local.score !== null
                                  ? "border-slate-200 bg-white"
                                  : "border-slate-200 bg-white"
                              )}
                            >
                              {/* Item name */}
                              <div className="mb-2.5">
                                <div className="flex items-start gap-2">
                                  <p className="text-sm text-slate-700 leading-snug flex-1">{item.item_name}</p>
                                  {hasGuidance && (
                                    <button
                                      onClick={() => setExpandedGuidance(prev => ({ ...prev, [guidanceKey]: !guidanceOpen }))}
                                      className="flex-shrink-0 text-slate-300 hover:text-blue-400 transition-colors mt-0.5"
                                      title="Show guidance note"
                                    >
                                      <HelpCircle className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                                {/* Guidance note */}
                                {guidanceOpen && hasGuidance && (
                                  <div className="mt-2 p-2.5 rounded-md bg-blue-50 border border-blue-100">
                                    <p className="text-xs text-blue-700 leading-relaxed whitespace-pre-line">
                                      {(item as any).guidance_note}
                                    </p>
                                  </div>
                                )}
                                {/* Status badges */}
                                <div className="flex items-center gap-2 flex-wrap mt-1">
                                  {isDeficiency && (
                                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-600">
                                      <AlertTriangle className="w-3 h-3" /> Deficiency
                                    </span>
                                  )}
                                  {typeof local.score === "number" && local.score >= 4 && (
                                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                                      <CheckCircle2 className="w-3 h-3" /> Good
                                    </span>
                                  )}
                                  {isNS && (
                                    <span className="text-[10px] font-semibold text-slate-500">Not Sighted</span>
                                  )}
                                </div>
                              </div>

                              {/* Score buttons: 0 1 2 3 4 5 NS */}
                              <div className="flex gap-1.5 flex-wrap items-center">
                                {([0, 1, 2, 3, 4, 5] as number[]).map((v) => (
                                  <ScoreButton
                                    key={v}
                                    value={v}
                                    selected={local.score === v}
                                    onClick={() => setScore(item.checklist_item_id, v)}
                                  />
                                ))}
                                <ScoreButton
                                  value="NS"
                                  selected={local.score === "NS"}
                                  onClick={() => setScore(item.checklist_item_id, "NS")}
                                />
                                {local.score !== null && local.score !== "NS" && typeof local.score === "number" && (
                                  <span className="ml-1 self-center text-xs text-slate-500">
                                    {SCORE_LABELS[local.score]}
                                  </span>
                                )}
                              </div>

                              {/* Comment — always shown once score is set */}
                              {local.score !== null && !isNS && (
                                <Textarea
                                  placeholder={isDeficiency ? "Observations / corrective action required…" : "Optional comment…"}
                                  value={local.comment}
                                  onChange={(e) => setComment(item.checklist_item_id, e.target.value)}
                                  className="text-xs mt-2.5 h-16 resize-none border-slate-200 focus:border-blue-400"
                                />
                              )}

                              {/* Evidence — only for deficiencies */}
                              {isDeficiency && (
                                <div className="mt-2.5">
                                  <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1.5">Evidence</p>
                                  <EvidenceInput
                                    urls={local.evidence_urls}
                                    onAdd={(url) => addEvidence(item.checklist_item_id, url)}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidenceInput({ urls, onAdd }: { urls: string[]; onAdd: (url: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div>
      <div className="flex gap-2">
        <Input
          placeholder="Paste evidence URL…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="text-xs h-8 border-slate-200"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs flex-shrink-0"
          onClick={() => { onAdd(value); setValue(""); }}
          disabled={!value.trim()}
        >
          Add
        </Button>
      </div>
      {urls.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {urls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate max-w-[150px]">
              Evidence {i + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
