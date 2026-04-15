"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getStoredUser } from "@/lib/api";
import { Vessel, ChecklistTemplate, UserProfile, Paginated } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

const INSPECTION_TYPES = ["routine", "special", "annual", "psc", "flag_state", "vetting"];
const PRIORITIES = ["low", "medium", "high", "critical"];

export default function NewInspectionRequestPage() {
  const router = useRouter();
  const user = getStoredUser();

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [surveyors, setSurveyors] = useState<UserProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    vessel_id: "",
    company_id: user?.company_id || "",
    port: "",
    inspection_type: "routine",
    scheduled_date: today,
    due_date: "",
    checklist_template_id: "",
    priority: "medium",
    assigned_surveyor: "",
    notes: "",
  });

  useEffect(() => {
    Promise.all([
      api.get<Paginated<Vessel>>("/api/vessels?limit=100"),
      api.get<Paginated<ChecklistTemplate>>("/api/checklists?limit=100"),
      api.get<Paginated<UserProfile>>("/api/users?role=surveyor&limit=100"),
    ]).then(([v, t, u]) => {
      setVessels(v.items);
      setTemplates(t.items);
      setSurveyors(u.items);
      if (v.items.length) setForm(f => ({ ...f, vessel_id: v.items[0].id, company_id: v.items[0].company_id }));
    });
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleVesselChange = (id: string) => {
    const v = vessels.find(v => v.id === id);
    setForm(f => ({ ...f, vessel_id: id, company_id: v?.company_id || f.company_id }));
  };

  const handleSubmit = async () => {
    if (!form.vessel_id || !form.port) {
      setError("Vessel and port are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, string> = {
        vessel_id: form.vessel_id,
        company_id: form.company_id,
        port: form.port,
        inspection_type: form.inspection_type,
        scheduled_date: new Date(form.scheduled_date).toISOString(),
        priority: form.priority,
      };
      if (form.due_date) payload.due_date = new Date(form.due_date).toISOString();
      if (form.checklist_template_id) payload.checklist_template_id = form.checklist_template_id;
      if (form.notes) payload.notes = form.notes;

      const req = await api.post<{ id: string }>("/api/inspection-requests", payload);

      // Assign surveyor separately if selected
      if (form.assigned_surveyor) {
        await api.put(`/api/inspection-requests/${req.id}`, { assigned_surveyor: form.assigned_surveyor });
      }

      router.push(`/inspection-requests/${req.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/inspection-requests" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">New Inspection Request</h1>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Vessel *</Label>
            <select value={form.vessel_id} onChange={(e) => handleVesselChange(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white">
              <option value="">Select vessel...</option>
              {vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Port *</Label>
              <Input placeholder="e.g. Rotterdam" value={form.port} onChange={(e) => set("port", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Inspection Type</Label>
              <select value={form.inspection_type} onChange={(e) => set("inspection_type", e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white">
                {INSPECTION_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Scheduled Date</Label>
              <Input type="date" value={form.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <select value={form.priority} onChange={(e) => set("priority", e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white">
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign Surveyor</Label>
              <select value={form.assigned_surveyor} onChange={(e) => set("assigned_surveyor", e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white">
                <option value="">Unassigned</option>
                {surveyors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Checklist Template</Label>
            <select value={form.checklist_template_id} onChange={(e) => set("checklist_template_id", e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white">
              <option value="">Select template...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.total_items} items)</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
              rows={3} placeholder="Additional notes..."
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 resize-none" />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>}

          <Button onClick={handleSubmit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 w-full">
            {saving ? "Creating..." : "Create Request"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
