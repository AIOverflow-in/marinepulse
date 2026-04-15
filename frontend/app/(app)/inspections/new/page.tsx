"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getStoredUser } from "@/lib/api";
import { Vessel, ChecklistTemplate, Paginated, UserProfile } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

export default function NewInspectionPage() {
  const router = useRouter();
  const user = getStoredUser();

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [surveyors, setSurveyors] = useState<UserProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    vessel_id: "",
    template_id: "",
    port: "",
    inspection_date: new Date().toISOString().slice(0, 10),
    surveyor_id: "",
    company_id: user?.company_id || "",
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
      if (t.items.length) setForm(f => ({ ...f, template_id: t.items[0].id }));
    });
  }, []);

  const handleVesselChange = (id: string) => {
    const v = vessels.find(v => v.id === id);
    setForm(f => ({ ...f, vessel_id: id, company_id: v?.company_id || f.company_id }));
  };

  const handleSubmit = async () => {
    if (!form.vessel_id || !form.template_id) {
      setError("Vessel and checklist template are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, string> = {
        vessel_id: form.vessel_id,
        template_id: form.template_id,
        company_id: form.company_id,
        port: form.port,
        inspection_date: new Date(form.inspection_date).toISOString(),
      };
      const insp = await api.post<{ id: string }>("/api/inspections", payload);
      router.push(`/inspections/${insp.id}/score`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create inspection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/inspections" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">New Inspection</h1>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Vessel *</Label>
            <select
              value={form.vessel_id}
              onChange={(e) => handleVesselChange(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white"
            >
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Checklist Template *</Label>
            <select
              value={form.template_id}
              onChange={(e) => setForm(f => ({ ...f, template_id: e.target.value }))}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white"
            >
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.total_items} items)</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input placeholder="e.g. Singapore" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Inspection Date</Label>
              <Input type="date" value={form.inspection_date} onChange={(e) => setForm(f => ({ ...f, inspection_date: e.target.value }))} />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>}

          <Button onClick={handleSubmit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 w-full">
            {saving ? "Creating..." : "Create & Start Scoring"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
