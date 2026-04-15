"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getStoredUser } from "@/lib/api";
import { InspectionRequest, Vessel, Paginated } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { format, isPast, parseISO } from "date-fns";
import { Plus, Clock } from "lucide-react";

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

const FILTER_CLASS = "border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors";

export default function InspectionRequestsPage() {
  const router = useRouter();
  const user = getStoredUser();
  const isAdmin = user?.role === "consultancy_admin";

  const [result, setResult] = useState<Paginated<InspectionRequest> | null>(null);
  const [vesselMap, setVesselMap] = useState<Record<string, string>>({});
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [vesselFilter, setVesselFilter] = useState("");
  const [skip, setSkip] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    api.get<Paginated<Vessel>>("/api/vessels?limit=100").then((r) => {
      setVessels(r.items);
      setVesselMap(Object.fromEntries(r.items.map(v => [v.id, v.name])));
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ skip: String(skip), limit: String(LIMIT) });
    if (statusFilter) params.set("status", statusFilter);
    if (vesselFilter) params.set("vessel_id", vesselFilter);
    api.get<Paginated<InspectionRequest>>(`/api/inspection-requests?${params}`)
      .then(setResult)
      .finally(() => setLoading(false));
  }, [skip, statusFilter, vesselFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSkip(0); }, [statusFilter, vesselFilter]);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Inspection Requests"
        subtitle="Manage and track vessel inspection requests"
        actions={
          isAdmin ? (
            <Button onClick={() => router.push("/inspection-requests/new")} className="bg-blue-600 hover:bg-blue-700 h-8 text-sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New Request
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <select value={vesselFilter} onChange={(e) => setVesselFilter(e.target.value)} className={FILTER_CLASS}>
          <option value="">All vessels</option>
          {vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={FILTER_CLASS}>
          <option value="">All statuses</option>
          {["pending", "assigned", "in_progress", "completed", "cancelled"].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </select>
        {(statusFilter || vesselFilter) && (
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600 h-8 text-xs" onClick={() => { setStatusFilter(""); setVesselFilter(""); }}>
            Clear filters
          </Button>
        )}
        {!loading && result && (
          <span className="ml-auto text-xs text-slate-400 tabular-nums">{result.total} requests</span>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-7 w-12 ml-auto rounded" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Vessel</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Port</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Scheduled</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {result?.items.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">No requests found</td></tr>
                  ) : (
                    result?.items.map((req) => {
                      const isOverdue = req.due_date && isPast(parseISO(req.due_date)) && req.status !== "completed" && req.status !== "cancelled";
                      return (
                        <tr key={req.id} className="border-b border-slate-50 last:border-0 hover:bg-blue-50/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800">{vesselMap[req.vessel_id] || "—"}</td>
                          <td className="px-4 py-3 text-slate-500">{req.port}</td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-slate-700 tabular-nums">{format(new Date(req.scheduled_date), "d MMM yyyy")}</p>
                              {isOverdue && (
                                <p className="flex items-center gap-0.5 text-[10px] font-semibold text-red-500 mt-0.5">
                                  <Clock className="w-3 h-3" /> Overdue
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[req.status]}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[req.status]}`} />
                              {req.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ring-1 ${PRIORITY_STYLES[req.priority]}`}>
                              {req.priority}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/inspection-requests/${req.id}`}>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500">View</Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Pagination total={result?.total ?? 0} skip={skip} limit={LIMIT} onChange={setSkip} />
        </>
      )}
    </div>
  );
}
