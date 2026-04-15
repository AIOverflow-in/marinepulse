"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { VesselBenchmark } from "@/types";

interface Props {
  data: VesselBenchmark | null;
}

function getBarColor(vhi: number): string {
  if (vhi >= 90) return "#10b981";
  if (vhi >= 75) return "#3b82f6";
  if (vhi >= 60) return "#f59e0b";
  if (vhi >= 45) return "#f97316";
  return "#ef4444";
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  const color = getBarColor(d.value);
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-slate-600 font-medium mb-1">{d.payload.name}</p>
      <p className="font-bold tabular-nums" style={{ color }}>VHI {d.value}</p>
    </div>
  );
}

export function VesselBenchmarkChart({ data }: Props) {
  if (!data?.vessels.length) return <div className="text-center text-slate-400 py-12 text-sm">No data</div>;

  const chartData = data.vessels.map((v) => ({
    name: v.vessel_name.replace("MV ", ""),
    vhi: v.vhi_score,
    grade: v.vhi_grade,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 8 }}>
        <CartesianGrid stroke="#e2e8f0" horizontal={false} strokeDasharray="none" />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="name"
          type="category"
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          x={data.fleet_average}
          stroke="#94a3b8"
          strokeDasharray="4 4"
          label={{ value: `Fleet avg ${data.fleet_average}`, position: "insideTopRight", fontSize: 10, fill: "#94a3b8", dy: -4 }}
        />
        <Bar dataKey="vhi" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={getBarColor(entry.vhi)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
