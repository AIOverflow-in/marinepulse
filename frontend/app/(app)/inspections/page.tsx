"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getStoredUser } from "@/lib/api";
import { Inspection, Vessel, Paginated } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { format } from "date-fns";
import { Plus, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-50 text-blue-700",
  submitted: "bg-amber-50 text-amber-700",
  reviewed: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
};

const STATUS_DOT: Record<string, string> = {
  draft: "bg-slate-400",
  in_progress: "bg-blue-500",
  submitted: "bg-amber-500",
  reviewed: "bg-emerald-500",
  closed: "bg-slate-400",
};

const STATUSES = ["draft", "in_progress", "submitted", "reviewed", "closed"];

function GradeBadge({ grade, score }: { grade?: string; score?: number }) {
  if (!grade) return null;
  const color =
    grade === "A" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
    grade === "B" ? "bg-blue-50 text-blue-700 ring-blue-200" :
    grade === "C" ? "bg-amber-50 text-amber-700 ring-amber-200" :
    "bg-red-50 text-red-700 ring-red-200";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded ring-1 ${color}`}>
      {score != null && <span className="tabular-nums">{score}</span>}
      <span className="opacity-70">·</span>
      {grade}
    </span>
  );
}

const FILTER_CLASS = "border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors";

export default function InspectionsPage() {
  const router = useRouter();
  const user = getStoredUser();
  const isAdmin = user?.role === "consultancy_admin";

  const [result, setResult] = useState<Paginated<Inspection> | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [vesselMap, setVesselMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [vesselFilter, setVesselFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [skip, setSkip] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    api.get<Paginated<Vessel>>("/api/vessels?limit=100").then((r) => {
      setVessels(r.items);
      setVesselMap(Object.fromEntries(r.items.map((v) => [v.id, v.name])));
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ skip: String(skip), limit: String(LIMIT) });
    if (vesselFilter) params.set("vessel_id", vesselFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    api.get<Paginated<Inspection>>(`/api/inspections?${params}`)
      .then(setResult)
      .finally(() => setLoading(false));
  }, [skip, vesselFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSkip(0); }, [vesselFilter, statusFilter, dateFrom, dateTo]);

  const hasFilters = vesselFilter || statusFilter || dateFrom || dateTo;

  // Summary counts from loaded data
  const inProgressCount = result?.items.filter(i => i.status === "in_progress").length ?? 0;
  const submittedCount = result?.items.filter(i => i.status === "submitted").length ?? 0;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Inspections"
        subtitle="All vessel inspection records"
        actions={
          isAdmin ? (
            <Button onClick={() => router.push("/inspections/new")} className="bg-blue-600 hover:bg-blue-700 h-8 text-sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New Inspection
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={vesselFilter} onChange={(e) => setVesselFilter(e.target.value)} className={FILTER_CLASS}>
          <option value="">All vessels</option>
          {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={FILTER_CLASS}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={FILTER_CLASS} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={FILTER_CLASS} />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600 h-8 text-xs" onClick={() => { setVesselFilter(""); setStatusFilter(""); setDateFrom(""); setDateTo(""); }}>
            Clear filters
          </Button>
        )}
        {!loading && result && (
          <div className="ml-auto flex items-center gap-2">
            {inProgressCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full ring-1 ring-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{inProgressCount} in progress
              </span>
            )}
            {submittedCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full ring-1 ring-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{submittedCount} awaiting review
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 ml-auto rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-8 ml-auto" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-7 w-14 ml-auto rounded" /></td>
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
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Port</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">VHI</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Deficiencies</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {result?.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center">
                        <p className="text-slate-400 text-sm">No inspections found</p>
                        {isAdmin && !hasFilters && (
                          <Button onClick={() => router.push("/inspections/new")} variant="outline" size="sm" className="mt-3 text-xs">
                            <Plus className="w-3.5 h-3.5 mr-1" /> Create first inspection
                          </Button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    result?.items.map((insp) => (
                      <tr key={insp.id} className="border-b border-slate-50 last:border-0 hover:bg-blue-50/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{vesselMap[insp.vessel_id] || "—"}</td>
                        <td className="px-4 py-3 text-slate-500 tabular-nums">{format(new Date(insp.inspection_date), "d MMM yyyy")}</td>
                        <td className="px-4 py-3 text-slate-500">{insp.port || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[insp.status]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[insp.status]}`} />
                            {insp.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {insp.vhi_score != null
                            ? <GradeBadge grade={insp.vhi_grade} score={insp.vhi_score} />
                            : <span className="text-slate-300 text-xs">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {insp.deficiency_count > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" />{insp.deficiency_count}
                            </span>
                          ) : <span className="text-slate-200 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={insp.status === "in_progress" ? `/inspections/${insp.id}/score` : `/inspections/${insp.id}`}>
                            <Button
                              size="sm"
                              variant={insp.status === "in_progress" ? "default" : "ghost"}
                              className={insp.status === "in_progress" ? "h-7 text-xs bg-blue-600 hover:bg-blue-700" : "h-7 text-xs text-slate-500"}
                            >
                              {insp.status === "in_progress" ? "Score" : "View"}
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))
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
