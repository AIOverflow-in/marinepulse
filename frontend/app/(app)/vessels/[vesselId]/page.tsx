"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, getStoredUser } from "@/lib/api";
import { Vessel, Inspection } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { AlertTriangle, Pencil, Loader2 } from "lucide-react";
import { format } from "date-fns";

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-600 bg-emerald-50 ring-emerald-200",
  B: "text-blue-600 bg-blue-50 ring-blue-200",
  C: "text-amber-600 bg-amber-50 ring-amber-200",
  D: "text-orange-600 bg-orange-50 ring-orange-200",
  F: "text-red-600 bg-red-50 ring-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-50 text-blue-700",
  submitted: "bg-amber-50 text-amber-700",
  reviewed: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
};

const STATUSES = ["active", "inactive", "drydock"];

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

export default function VesselDetailPage() {
  const { vesselId } = useParams<{ vesselId: string }>();
  const user = getStoredUser();
  const isAdmin = user?.role === "consultancy_admin" || user?.role === "shipping_company";

  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Vessel>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Vessel>(`/api/vessels/${vesselId}`),
      api.get<Inspection[]>(`/api/vessels/${vesselId}/inspections`),
    ]).then(([v, insp]) => {
      setVessel(v);
      setInspections(insp);
    }).finally(() => setLoading(false));
  }, [vesselId]);

  const openEdit = () => {
    if (vessel) setEditForm({ name: vessel.name, current_port: vessel.current_port, status: vessel.status, flag_state: vessel.flag_state });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = await api.put<Vessel>(`/api/vessels/${vesselId}`, editForm);
      setVessel(updated);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-6 w-48" />
      <div className="grid grid-cols-3 gap-4"><Skeleton className="h-28 col-span-2 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );

  if (!vessel) return <div className="p-6 text-slate-500 text-sm">Vessel not found</div>;

  const latest = inspections.find(i => i.vhi_score !== null && i.vhi_score !== undefined);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title={vessel.name}
        subtitle={`${vessel.imo_number} · ${vessel.vessel_type.replace(/_/g, " ")}`}
        breadcrumbs={[{ label: "Vessels", href: "/vessels" }, { label: vessel.name }]}
        actions={
          isAdmin ? (
            <Button variant="outline" size="sm" onClick={openEdit} className="h-8 text-xs">
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Vessel
            </Button>
          ) : undefined
        }
      />

      {/* Stats strip + VHI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="p-5">
            <div className="grid grid-cols-3 gap-5 mb-4 pb-4 border-b border-slate-100">
              <StatItem label="Type" value={vessel.vessel_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} />
              <StatItem label="Flag State" value={vessel.flag_state} />
              <StatItem label="Year Built" value={String(vessel.year_built)} />
            </div>
            <div className="grid grid-cols-3 gap-5">
              <StatItem label="Gross Tonnage" value={`${vessel.gross_tonnage.toLocaleString()} GT`} />
              <StatItem label="Current Port" value={vessel.current_port || "—"} />
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full capitalize ${vessel.status === "active" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : vessel.status === "drydock" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" : "bg-slate-100 text-slate-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${vessel.status === "active" ? "bg-emerald-500" : vessel.status === "drydock" ? "bg-amber-500" : "bg-slate-400"}`} />
                  {vessel.status}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex items-center justify-center">
          <CardContent className="p-5 text-center w-full">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Latest VHI</p>
            {latest?.vhi_score !== undefined && latest?.vhi_score !== null ? (
              <>
                <div className={`text-5xl font-black tabular-nums mb-2 ${latest.vhi_grade ? GRADE_COLORS[latest.vhi_grade]?.split(" ")[0] : "text-slate-800"}`}>
                  {latest.vhi_score.toFixed(1)}
                </div>
                {latest.vhi_grade && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${GRADE_COLORS[latest.vhi_grade]}`}>
                    Grade {latest.vhi_grade}
                  </span>
                )}
                {latest.deficiency_count > 0 && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3" />{latest.deficiency_count} deficiencies
                  </p>
                )}
              </>
            ) : (
              <p className="text-slate-400 text-sm">No completed inspections</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inspection history table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold">Inspection History</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {inspections.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-10">No inspections yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Port</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">VHI</th>
                  <th className="text-right px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Deficiencies</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((insp) => (
                  <tr key={insp.id} className="border-b border-slate-50 last:border-0 hover:bg-blue-50/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-800 tabular-nums">
                      {format(new Date(insp.inspection_date), "d MMM yyyy")}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{insp.port || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[insp.status]}`}>
                        {insp.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {insp.vhi_score !== null && insp.vhi_score !== undefined && insp.vhi_grade ? (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ring-1 tabular-nums ${GRADE_COLORS[insp.vhi_grade]}`}>
                          {insp.vhi_score.toFixed(1)} · {insp.vhi_grade}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {insp.deficiency_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" />{insp.deficiency_count}
                        </span>
                      ) : <span className="text-slate-200 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/inspections/${insp.id}`} className="text-xs text-blue-600 hover:underline font-medium">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Vessel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { key: "name", label: "Name" },
              { key: "flag_state", label: "Flag State" },
              { key: "current_port", label: "Current Port" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</Label>
                <Input
                  value={(editForm as any)[key] || ""}
                  onChange={(e) => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</Label>
              <select
                value={editForm.status || "active"}
                onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="h-8 text-sm">Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} className="h-8 text-sm bg-blue-600 hover:bg-blue-700">
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Saving…</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
