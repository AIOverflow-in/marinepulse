"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getStoredUser } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

const VESSEL_TYPES = ["bulk_carrier", "container", "tanker", "ro_ro", "general_cargo", "passenger", "offshore"];
const STATUSES = ["active", "inactive", "drydock"];

export default function NewVesselPage() {
  const router = useRouter();
  const user = getStoredUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    imo_number: "",
    vessel_type: "bulk_carrier",
    flag_state: "",
    year_built: new Date().getFullYear(),
    gross_tonnage: 0,
    current_port: "",
    status: "active",
    company_id: user?.company_id || "",
  });

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name || !form.imo_number || !form.flag_state) {
      setError("Name, IMO number, and flag state are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const vessel = await api.post<{ id: string }>("/api/vessels", {
        ...form,
        year_built: Number(form.year_built),
        gross_tonnage: Number(form.gross_tonnage),
      });
      router.push(`/vessels/${vessel.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create vessel");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/vessels" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">Add Vessel</h1>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Vessel Name *</Label>
              <Input placeholder="MV Example" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>IMO Number *</Label>
              <Input placeholder="IMO1234567" value={form.imo_number} onChange={(e) => set("imo_number", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Vessel Type</Label>
              <select
                value={form.vessel_type}
                onChange={(e) => set("vessel_type", e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white"
              >
                {VESSEL_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Flag State *</Label>
              <Input placeholder="Panama" value={form.flag_state} onChange={(e) => set("flag_state", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Year Built</Label>
              <Input type="number" value={form.year_built} onChange={(e) => set("year_built", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gross Tonnage</Label>
              <Input type="number" value={form.gross_tonnage} onChange={(e) => set("gross_tonnage", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-600 bg-white"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Current Port</Label>
            <Input placeholder="e.g. Singapore" value={form.current_port} onChange={(e) => set("current_port", e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>}

          <Button onClick={handleSubmit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 w-full">
            {saving ? "Creating..." : "Create Vessel"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
