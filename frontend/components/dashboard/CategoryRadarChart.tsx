"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { CategoryPerformance } from "@/types";

interface Props {
  data: CategoryPerformance[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  const score = d.value as number;
  const color = score >= 4 ? "#10b981" : score >= 3 ? "#3b82f6" : score >= 2 ? "#f59e0b" : "#ef4444";
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-slate-600 font-medium mb-1">{d.payload.category}</p>
      <p className="font-bold tabular-nums" style={{ color }}>{score.toFixed(2)} / 5</p>
    </div>
  );
}

export function CategoryRadarChart({ data }: Props) {
  if (!data.length) return <div className="text-center text-slate-400 py-12 text-sm">No data</div>;

  // Abbreviate long category names for the radar
  const abbreviate = (cat: string) => {
    const map: Record<string, string> = {
      "Hull & Structural Integrity": "Hull",
      "Deck Machinery & Fittings": "Deck Mach.",
      "Cargo Handling Systems": "Cargo",
      "Ballast & Stability": "Ballast",
      "Engine Room & Machinery": "Engine Room",
      "Electrical Systems": "Electrical",
      "Safety & Firefighting Equipment": "Safety",
      "Bridge & Navigation": "Bridge",
      "Pollution Prevention": "Pollution",
      "Accommodation & Living Spaces": "Accomm.",
      "Emergency Preparedness": "Emergency",
    };
    return map[cat] || cat.split(" ")[0];
  };

  const chartData = data.map((d) => ({
    category: abbreviate(d.category),
    score: parseFloat(d.avg_score.toFixed(2)),
    fullMark: 5,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: "#64748b" }} />
        <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickCount={4} />
        <Radar
          name="Avg Score"
          dataKey="score"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.15}
          strokeWidth={2}
        />
        <Tooltip content={<CustomTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
