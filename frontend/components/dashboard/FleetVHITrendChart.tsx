"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AnalyticsFleetVHI } from "@/types";
import { format } from "date-fns";

interface Props {
  data: AnalyticsFleetVHI[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2.5 text-xs">
      <p className="text-slate-500 font-medium mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-600">{p.dataKey}</span>
          </span>
          <span className="font-semibold text-slate-900 tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function FleetVHITrendChart({ data }: Props) {
  if (!data.length) return <div className="text-center text-slate-400 py-12 text-sm">No data available</div>;

  const dateSet = new Set<string>();
  data.forEach((v) => v.data_points.forEach((dp) => dateSet.add(dp.date.slice(0, 7))));
  const sortedDates = Array.from(dateSet).sort();

  const chartData = sortedDates.map((month) => {
    const row: Record<string, string | number> = {
      month: format(new Date(month + "-01"), "MMM yy"),
    };
    data.forEach((v) => {
      const dp = v.data_points.find((p) => p.date.slice(0, 7) === month);
      if (dp) row[v.vessel_name] = dp.vhi;
    });
    return row;
  });

  // Custom legend below
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="none" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip content={<CustomTooltip />} />
          {data.map((v, i) => (
            <Line
              key={v.vessel_id}
              type="monotone"
              dataKey={v.vessel_name}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Custom legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
        {data.map((v, i) => (
          <span key={v.vessel_id} className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-3 h-[2px] rounded-full inline-block" style={{ background: COLORS[i % COLORS.length] }} />
            {v.vessel_name.replace("MV ", "")}
          </span>
        ))}
      </div>
    </div>
  );
}
