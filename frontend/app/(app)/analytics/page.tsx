"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AnalyticsFleetVHI, VesselBenchmark, Deficiency, CategoryPerformance } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FleetVHITrendChart } from "@/components/dashboard/FleetVHITrendChart";
import { VesselBenchmarkChart } from "@/components/dashboard/VesselBenchmarkChart";
import { CategoryRadarChart } from "@/components/dashboard/CategoryRadarChart";
import { DeficiencyHeatmap } from "@/components/dashboard/DeficiencyHeatmap";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsPage() {
  const [fleetVHI, setFleetVHI] = useState<AnalyticsFleetVHI[]>([]);
  const [benchmark, setBenchmark] = useState<VesselBenchmark | null>(null);
  const [deficiencies, setDeficiencies] = useState<Deficiency[]>([]);
  const [categoryPerf, setCategoryPerf] = useState<CategoryPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<AnalyticsFleetVHI[]>("/api/analytics/fleet-vhi"),
      api.get<VesselBenchmark>("/api/analytics/vessel-benchmark"),
      api.get<Deficiency[]>("/api/analytics/deficiencies"),
      api.get<CategoryPerformance[]>("/api/analytics/category-performance"),
    ]).then(([vhi, bench, def, cat]) => {
      setFleetVHI(vhi);
      setBenchmark(bench);
      setDeficiencies(def);
      setCategoryPerf(cat);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">Deep insights into fleet performance and deficiency trends</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">VHI Trend — 18 Months</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[300px]" /> : <FleetVHITrendChart data={fleetVHI} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vessel Benchmark</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[300px]" /> : <VesselBenchmarkChart data={benchmark} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Category Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[300px]" /> : <CategoryRadarChart data={categoryPerf} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Recurring Deficiencies</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[300px]" /> : <DeficiencyHeatmap data={deficiencies} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
