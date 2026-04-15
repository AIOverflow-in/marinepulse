"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AnalyticsFleetVHI, VesselBenchmark, Deficiency, CategoryPerformance, FleetSummary } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FleetSummaryCards } from "@/components/dashboard/FleetSummaryCards";
import { FleetVHITrendChart } from "@/components/dashboard/FleetVHITrendChart";
import { VesselBenchmarkChart } from "@/components/dashboard/VesselBenchmarkChart";
import { CategoryRadarChart } from "@/components/dashboard/CategoryRadarChart";
import { DeficiencyHeatmap } from "@/components/dashboard/DeficiencyHeatmap";
import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton({ height = 300 }: { height?: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <Skeleton className="h-4 w-40 mb-4" />
        <Skeleton style={{ height }} />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<FleetSummary | null>(null);
  const [fleetVHI, setFleetVHI] = useState<AnalyticsFleetVHI[]>([]);
  const [benchmark, setBenchmark] = useState<VesselBenchmark | null>(null);
  const [deficiencies, setDeficiencies] = useState<Deficiency[]>([]);
  const [categoryPerf, setCategoryPerf] = useState<CategoryPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, vhi, bench, def, cat] = await Promise.all([
          api.get<FleetSummary>("/api/analytics/summary"),
          api.get<AnalyticsFleetVHI[]>("/api/analytics/fleet-vhi"),
          api.get<VesselBenchmark>("/api/analytics/vessel-benchmark"),
          api.get<Deficiency[]>("/api/analytics/deficiencies"),
          api.get<CategoryPerformance[]>("/api/analytics/category-performance"),
        ]);
        setSummary(s);
        setFleetVHI(vhi);
        setBenchmark(bench);
        setDeficiencies(def);
        setCategoryPerf(cat);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="pb-5 border-b border-slate-200">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Fleet Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Real-time overview of vessel health and inspection status</p>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <Skeleton className="h-9 w-9 rounded-lg mb-3" />
              <Skeleton className="h-3 w-28 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <FleetSummaryCards data={summary} />
      )}

      {/* Charts row 1 — 60/40 split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-slate-700">VHI Trend — 18 Months</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">Vessel Health Index over time per vessel</p>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {loading ? <Skeleton className="h-[280px]" /> : <FleetVHITrendChart data={fleetVHI} />}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-slate-700">Fleet Benchmark</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">Latest VHI score per vessel</p>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {loading ? <Skeleton className="h-[280px]" /> : <VesselBenchmarkChart data={benchmark} />}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 — 40/60 split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-slate-700">Category Performance</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">Average score per inspection category</p>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {loading ? <Skeleton className="h-[280px]" /> : <CategoryRadarChart data={categoryPerf} />}
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-slate-700">Top Recurring Deficiencies</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">Most frequently failed checklist items</p>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {loading ? <Skeleton className="h-[280px]" /> : <DeficiencyHeatmap data={deficiencies} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
