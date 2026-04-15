"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getStoredUser } from "@/lib/api";
import { InspectionRequest, Vessel, ChecklistTemplate, UserProfile, Paginated } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pencil, Plus, Loader2, CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  assigned: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-500",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-slate-400",
  assigned: "bg-blue-500",
  in_progress: "bg-amber-500",
  completed: "bg-emerald-500",
  cancelled: "bg-red-400",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-50 text-slate-500 ring-slate-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  high: "bg-orange-50 text-orange-700 ring-orange-200",
  critical: "bg-red-50 text-red-700 ring-red-200",
};

const STEPPER_STATUSES = ["pending", "assigned", "in_progress", "completed"] as const;
const STEPPER_LABELS: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
};

const FIELD_CLASS = "text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1";

function StatusStepper({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-600 ring-1 ring-red-200">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Cancelled
        </span>
      </div>
    );
  }

  const currentIndex = STEPPER_STATUSES.indexOf(status as any);

  return (
    <div className="flex items-center gap-0">
      {STEPPER_STATUSES.map((s, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ring-2 transition-colors ${
                isDone ? "bg-emerald-500 ring-emerald-500" :
                isActive ? "bg-blue-600 ring-blue-600" :
                "bg-white ring-slate-200"
              }`}>
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-white" />
                ) : isActive ? (
                  <span className="w-2 h-2 bg-white rounded-full" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-slate-300" />
                )}
              </div>
              <span className={`text-[10px] font-medium mt-1.5 whitespace-nowrap ${
                isDone ? "text-emerald-600" : isActive ? "text-blue-600 font-semibold" : "text-slate-400"
              }`}>{STEPPER_LABELS[s]}</span>
            </div>
            {i < STEPPER_STATUSES.length - 1 && (
              <div className={`h-0.5 w-12 mb-4 mx-1 transition-colors ${i < currentIndex ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={FIELD_CLASS}>{label}</p>
      <div className="text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

export default function InspectionRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = getStoredUser();
  const isAdmin = user?.role === "consultancy_admin";

  const [request, setRequest] = useState<InspectionRequest | null>(null);
  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [surveyors, setSurveyors] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ assigned_surveyor: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const [creatingInspection, setCreatingInspection] = useState(false);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<InspectionRequest>(`/api/inspection-requests/${id}`),
      api.get<Paginated<UserProfile>>("/api/users?role=surveyor&limit=100"),
      api.get<Paginated<ChecklistTemplate>>("/api/checklists?limit=100"),
    ]).then(([req, u, t]) => {
      setRequest(req);
      setSurveyors(u.items);
      setTemplates(t.items);
      setEditForm({ assigned_surveyor: req.assigned_surveyor || "", notes: req.notes || "" });
      if (t.items.length) setSelectedTemplate(req.checklist_template_id || t.items[0].id);
      return api.get<Vessel>(`/api/vessels/${req.vessel_id}`);
    }).then(setVessel).finally(() => setLoading(false));
  }, [id]);

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = await api.put<InspectionRequest>(`/api/inspection-requests/${id}`, {
        assigned_surveyor: editForm.assigned_surveyor || undefined,
        notes: editForm.notes || undefined,
      });
      setRequest(updated);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const createInspection = async () => {
    if (!request || !selectedTemplate) return;
    setCreatingInspection(true);
    try {
      const insp = await api.post<{ id: string }>("/api/inspections", {
        vessel_id: request.vessel_id,
        company_id: request.company_id,
        template_id: selectedTemplate,
        port: request.port,
        inspection_date: request.scheduled_date,
        request_id: id,
      });
      router.push(`/inspections/${insp.id}/score`);
    } finally {
      setCreatingInspection(false);
    }
  };

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );

  if (!request) return <div className="p-6 text-slate-500 text-sm">Request not found</div>;

  const surveyorName = surveyors.find(s => s.id === request.assigned_surveyor)?.name;

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <PageHeader
        title="Inspection Request"
        subtitle={vessel ? `${vessel.name} · ${request.port}` : request.port}
        breadcrumbs={[{ label: "Inspection Requests", href: "/inspection-requests" }, { label: vessel?.name || "Request" }]}
        actions={
          isAdmin ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="h-8 text-xs">
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
              {(request.status === "assigned" || request.status === "pending") && (
                <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700" onClick={createInspection} disabled={creatingInspection}>
                  {creatingInspection ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating…</> : <><Plus className="w-3.5 h-3.5 mr-1.5" />Create Inspection</>}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {/* Status stepper */}
      <Card>
        <CardContent className="px-6 py-5">
          <p className={FIELD_CLASS + " mb-3"}>Progress</p>
          <StatusStepper status={request.status} />
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            <FieldItem label="Status">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[request.status]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[request.status]}`} />
                {request.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            </FieldItem>
            <FieldItem label="Priority">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ring-1 ${PRIORITY_STYLES[request.priority]}`}>
                {request.priority}
              </span>
            </FieldItem>
            <FieldItem label="Type">
              <span className="capitalize">{request.inspection_type.replace(/_/g, " ")}</span>
            </FieldItem>
            <FieldItem label="Scheduled">
              {format(new Date(request.scheduled_date), "d MMM yyyy")}
            </FieldItem>
            {request.due_date && (
              <FieldItem label="Due Date">
                {format(new Date(request.due_date), "d MMM yyyy")}
              </FieldItem>
            )}
            <FieldItem label="Assigned Surveyor">
              {surveyorName || <span className="text-slate-400 font-normal">Unassigned</span>}
            </FieldItem>
            <FieldItem label="Created">
              {format(new Date(request.created_at), "d MMM yyyy")}
            </FieldItem>
          </div>

          {request.notes && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <p className={FIELD_CLASS}>Notes</p>
              <p className="text-sm text-slate-700 leading-relaxed mt-1">{request.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Inspection section */}
      {isAdmin && (request.status === "assigned" || request.status === "pending") && templates.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-slate-800 mb-3">Start Inspection</p>
            <div className="space-y-3">
              <div>
                <p className={FIELD_CLASS}>Checklist Template</p>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors mt-1"
                >
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.total_items} items)</option>)}
                </select>
              </div>
              <Button onClick={createInspection} disabled={creatingInspection} className="bg-blue-600 hover:bg-blue-700 h-8 text-xs">
                {creatingInspection ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating…</> : <><Plus className="w-3.5 h-3.5 mr-1.5" />Create & Start Scoring</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Assign Surveyor</Label>
              <select
                value={editForm.assigned_surveyor}
                onChange={(e) => setEditForm(f => ({ ...f, assigned_surveyor: e.target.value }))}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                <option value="">Unassigned</option>
                {surveyors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Notes</Label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="h-8 text-sm">Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} className="h-8 text-sm bg-blue-600 hover:bg-blue-700">
              {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
