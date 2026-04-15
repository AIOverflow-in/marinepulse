"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getStoredUser } from "@/lib/api";
import { Vessel, Paginated } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { Ship, MapPin, Plus, Search } from "lucide-react";

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  inactive: "bg-slate-100 text-slate-500 ring-slate-200",
  drydock: "bg-amber-50 text-amber-700 ring-amber-200",
};

const FILTER_CLASS = "border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors";

export default function VesselsPage() {
  const router = useRouter();
  const user = getStoredUser();
  const isAdmin = user?.role === "consultancy_admin" || user?.role === "shipping_company";

  const [result, setResult] = useState<Paginated<Vessel> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [skip, setSkip] = useState(0);
  const LIMIT = 12;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ skip: String(skip), limit: String(LIMIT) });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    api.get<Paginated<Vessel>>(`/api/vessels?${params}`)
      .then(setResult)
      .finally(() => setLoading(false));
  }, [skip, search, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSkip(0); }, [search, status]);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Vessels"
        subtitle="Fleet vessel registry"
        actions={
          isAdmin ? (
            <Button onClick={() => router.push("/vessels/new")} className="bg-blue-600 hover:bg-blue-700 h-8 text-sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Vessel
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            placeholder="Search name or IMO…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-60 border-slate-200"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={FILTER_CLASS}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="drydock">Drydock</option>
        </select>
        {!loading && result && (
          <span className="ml-auto text-xs text-slate-400 tabular-nums">{result.total} vessels</span>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : result?.items.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Ship className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600">No vessels found</p>
          <p className="text-xs text-slate-400 mt-1">
            {search || status ? "Try adjusting your filters" : "Add your first vessel to start tracking"}
          </p>
          {isAdmin && !search && !status && (
            <Button onClick={() => router.push("/vessels/new")} variant="outline" size="sm" className="mt-3 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Vessel
            </Button>
          )}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Vessel</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Flag</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Current Port</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.items.map((v) => (
                    <tr
                      key={v.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-blue-50/20 transition-colors cursor-pointer"
                      onClick={() => router.push(`/vessels/${v.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-blue-50 rounded-md flex items-center justify-center flex-shrink-0">
                            <Ship className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{v.name}</p>
                            <p className="text-xs text-slate-400 tabular-nums">{v.imo_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{typeLabel(v.vessel_type)}</td>
                      <td className="px-4 py-3 text-slate-500">{v.flag_state}</td>
                      <td className="px-4 py-3">
                        {v.current_port ? (
                          <span className="flex items-center gap-1 text-slate-500">
                            <MapPin className="w-3 h-3 text-slate-400" />{v.current_port}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ring-1 capitalize ${STATUS_STYLES[v.status] || "bg-slate-100 text-slate-500 ring-slate-200"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${v.status === "active" ? "bg-emerald-500" : v.status === "drydock" ? "bg-amber-500" : "bg-slate-400"}`} />
                          {v.status}
                        </span>
                      </td>
                    </tr>
                  ))}
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
