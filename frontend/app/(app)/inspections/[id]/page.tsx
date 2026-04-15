"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Inspection, InspectionScore } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { AlertTriangle, CheckCircle2, Edit3, Printer, Loader2, FileDown } from "lucide-react";
import { format } from "date-fns";
import { getStoredUser } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-50 text-blue-700",
  submitted: "bg-amber-50 text-amber-700",
  reviewed: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
};

function gradeLabel(pct: number): string {
  if (pct >= 80) return "A";
  if (pct >= 65) return "B";
  if (pct >= 50) return "C";
  if (pct >= 35) return "D";
  return "F";
}

function gradeColor(grade: string): string {
  return grade === "A" ? "text-emerald-600" : grade === "B" ? "text-blue-600" : grade === "C" ? "text-amber-600" : "text-red-600";
}

function ScoreChip({ score }: { score: number | string | null }) {
  if (score === null || score === undefined) return <span className="text-slate-300 text-xs tabular-nums">—</span>;
  if (score === "NS") return <span className="text-xs text-slate-400 font-medium">NS</span>;
  const n = score as number;
  const color = n <= 1 ? "text-red-600" : n === 2 ? "text-orange-500" : n === 3 ? "text-amber-600" : n === 4 ? "text-lime-600" : "text-emerald-600";
  return <span className={`text-xs font-semibold tabular-nums ${color}`}>{n}/5</span>;
}

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<ReturnType<typeof getStoredUser>>(null);
  useEffect(() => { setUser(getStoredUser()); }, []);
  const isAdmin = user?.role === "consultancy_admin";

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [scores, setScores] = useState<InspectionScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [adminRemarks, setAdminRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Inspection>(`/api/inspections/${id}`),
      api.get<InspectionScore[]>(`/api/inspections/${id}/scores`),
    ]).then(([insp, sc]) => {
      setInspection(insp);
      setAdminRemarks(insp.admin_remarks || "");
      setScores(sc);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSaveRemarks = async () => {
    setSaving(true);
    try {
      await api.put(`/api/inspections/${id}`, { admin_remarks: adminRemarks });
      setInspection((prev) => prev ? { ...prev, admin_remarks: adminRemarks } : null);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReviewed = async () => {
    await api.put(`/api/inspections/${id}`, { status: "reviewed" });
    setInspection((prev) => prev ? { ...prev, status: "reviewed" } : null);
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const blob = await api.getBlob(`/api/inspections/${id}/report`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-report-${id}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Report generation failed. Please try again.");
    } finally {
      setGeneratingReport(false);
    }
  };

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-6 w-64" />
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
  if (!inspection) return <div className="p-6 text-slate-500 text-sm">Inspection not found</div>;

  // Build category groups with assessment_type
  const groupMap: Record<string, { cat: string; type: string; items: InspectionScore[] }> = {};
  scores.forEach((s) => {
    const key = `${s.assessment_type || "static"}:${s.category}`;
    if (!groupMap[key]) groupMap[key] = { cat: s.category, type: s.assessment_type || "static", items: [] };
    groupMap[key].items.push(s);
  });

  const staticGroups = Object.values(groupMap).filter(g => g.type === "static");
  const dynamicGroups = Object.values(groupMap).filter(g => g.type === "dynamic");
  const deficiencies = scores.filter((s) => s.is_deficiency);

  const pct = inspection.vhi_score;
  const grade = pct != null ? gradeLabel(pct) : null;

  // Compute category summary from scored data
  function categorySummary(groups: typeof staticGroups) {
    return groups.map((g) => {
      const numeric = g.items.filter(i => typeof i.score === "number") as (InspectionScore & { score: number })[];
      const nsCount = g.items.filter(i => i.score === "NS").length;
      const assessed = numeric.length;
      const total = numeric.reduce((s, i) => s + i.score, 0);
      const avg = assessed > 0 ? total / assessed : null;
      const pctScore = assessed > 0 ? (total / (assessed * 5)) * 100 : null;
      return { ...g, assessed, nsCount, avg, pctScore };
    });
  }

  const staticSummary = categorySummary(staticGroups);
  const dynamicSummary = categorySummary(dynamicGroups);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title={`Audit Report · ${format(new Date(inspection.inspection_date), "d MMM yyyy")}`}
        subtitle={inspection.port || "Port not specified"}
        breadcrumbs={[{ label: "Inspections", href: "/inspections" }, { label: format(new Date(inspection.inspection_date), "d MMM yyyy") }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs no-print"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" /> Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs no-print"
              onClick={handleGenerateReport}
              disabled={generatingReport || inspection.status === "in_progress"}
              title={inspection.status === "in_progress" ? "Submit inspection first to generate report" : ""}
            >
              {generatingReport ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 mr-1.5" />}
              {generatingReport ? "Generating…" : "Download Report"}
            </Button>
            {isAdmin && inspection.status === "submitted" && (
              <Button onClick={handleMarkReviewed} size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 no-print">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Mark Reviewed
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => setEditOpen(true)} variant="outline" size="sm" className="h-8 text-xs no-print">
                <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit Remarks
              </Button>
            )}
          </div>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Score card */}
        <Card>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            {pct != null ? (
              <>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Audit Score</p>
                <p className={`text-3xl font-bold tabular-nums leading-none ${grade ? gradeColor(grade) : "text-slate-900"}`}>
                  {pct.toFixed(1)}<span className="text-lg">%</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Grade <span className={`font-bold ${grade ? gradeColor(grade) : ""}`}>{grade}</span>
                </p>
              </>
            ) : (
              <p className="text-slate-400 text-sm">Not scored</p>
            )}
          </CardContent>
        </Card>

        {/* Average */}
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Average Score</p>
            {pct != null && inspection.scored_items > 0 ? (
              <>
                <p className="text-3xl font-bold tabular-nums text-slate-900">—</p>
              </>
            ) : null}
            {/* Show from scores */}
            {(() => {
              const numeric = scores.filter(s => typeof s.score === "number") as (InspectionScore & { score: number })[];
              const avg = numeric.length > 0 ? numeric.reduce((s, i) => s + i.score, 0) / numeric.length : null;
              return avg !== null ? (
                <p className="text-3xl font-bold tabular-nums text-slate-900">
                  {avg.toFixed(2)}<span className="text-base text-slate-400 font-normal">/5</span>
                </p>
              ) : <p className="text-slate-400 text-sm text-xl">—</p>;
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[inspection.status]}`}>
              {inspection.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
              <span className="tabular-nums">{inspection.scored_items}/{inspection.total_items} scored</span>
              {scores.filter(s => s.score === "NS").length > 0 && (
                <span className="text-slate-400">NS: {scores.filter(s => s.score === "NS").length}</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Deficiencies</p>
            <p className={`text-3xl font-bold tabular-nums ${deficiencies.length > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {deficiencies.length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">items scored &lt; 3</p>
          </CardContent>
        </Card>
      </div>

      {/* Admin remarks */}
      {inspection.admin_remarks && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">Admin Remarks</p>
          <p className="text-sm text-blue-900 leading-relaxed">{inspection.admin_remarks}</p>
        </div>
      )}

      {/* Deficiencies */}
      {deficiencies.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Deficiencies ({deficiencies.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="space-y-2">
              {deficiencies.map((d) => (
                <div key={d.id} className="border-l-4 border-red-400 pl-3 py-2 rounded-r-lg bg-white border border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 leading-snug">{d.item_name || d.category}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{d.category}</p>
                      {d.comment && <p className="text-xs text-slate-500 mt-1 italic">"{d.comment}"</p>}
                    </div>
                    <span className="text-sm font-bold text-red-600 flex-shrink-0 tabular-nums">{d.score}/5</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Breakdown */}
      {(staticSummary.length > 0 || dynamicSummary.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[
            { label: "Static Assessment", rows: staticSummary },
            { label: "Dynamic Assessment", rows: dynamicSummary },
          ].map(({ label, rows }) => rows.length > 0 && (
            <Card key={label}>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">{label}</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                      <th className="text-right py-2 px-5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Assessed</th>
                      <th className="text-right py-2 px-5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Avg</th>
                      <th className="text-right py-2 px-5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.cat} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 px-5 text-slate-700">{row.cat}</td>
                        <td className="py-2 px-5 text-right tabular-nums text-slate-500">
                          {row.assessed}{row.nsCount > 0 && <span className="text-slate-300"> (+{row.nsCount} NS)</span>}
                        </td>
                        <td className={`py-2 px-5 text-right tabular-nums font-semibold ${row.avg !== null ? (row.avg >= 4 ? "text-emerald-600" : row.avg >= 3 ? "text-blue-600" : row.avg >= 2 ? "text-amber-600" : "text-red-600") : "text-slate-300"}`}>
                          {row.avg !== null ? row.avg.toFixed(2) : "—"}
                        </td>
                        <td className={`py-2 px-5 text-right tabular-nums font-semibold ${row.pctScore !== null ? (row.pctScore >= 80 ? "text-emerald-600" : row.pctScore >= 65 ? "text-blue-600" : row.pctScore >= 50 ? "text-amber-600" : "text-red-600") : "text-slate-300"}`}>
                          {row.pctScore !== null ? `${row.pctScore.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Full score list */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold">All Scores</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="space-y-5">
            {[...staticGroups, ...dynamicGroups].map((g) => (
              <div key={`${g.type}:${g.cat}`}>
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100">
                      {g.type === "static" ? "S" : "D"}
                    </span>
                    <h4 className="text-xs font-semibold text-slate-700">{g.cat}</h4>
                  </div>
                  {(() => {
                    const numeric = g.items.filter(i => typeof i.score === "number") as (InspectionScore & { score: number })[];
                    const avg = numeric.length > 0 ? numeric.reduce((s, i) => s + i.score, 0) / numeric.length : null;
                    return avg !== null ? (
                      <span className={`text-xs font-semibold tabular-nums ${avg >= 4 ? "text-emerald-600" : avg >= 3 ? "text-blue-600" : avg >= 2 ? "text-amber-600" : "text-red-600"}`}>
                        {avg.toFixed(2)}/5
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="space-y-1">
                  {g.items.map((item) => (
                    <div key={item.id} className={`flex items-center justify-between py-1.5 px-2 rounded text-sm ${item.is_deficiency ? "bg-red-50" : "hover:bg-slate-50"}`}>
                      <span className="text-slate-600 flex-1 text-xs leading-snug pr-3">{item.item_name}</span>
                      <ScoreChip score={item.score} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit remarks dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Admin Remarks</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Remarks</Label>
            <Textarea
              value={adminRemarks}
              onChange={(e) => setAdminRemarks(e.target.value)}
              placeholder="Add admin remarks, observations, or follow-up actions…"
              rows={5}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="h-8 text-sm">Cancel</Button>
            <Button onClick={handleSaveRemarks} disabled={saving} className="h-8 text-sm bg-blue-600 hover:bg-blue-700">
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Saving…</> : "Save Remarks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
