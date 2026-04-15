"use client";

import { Ship, Activity, Calendar, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { FleetSummary } from "@/types";

interface Props {
  data: FleetSummary | null;
}

const cards = [
  {
    key: "active_vessels" as const,
    label: "Active Vessels",
    icon: Ship,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    accentColor: "bg-blue-500",
    format: (v: number) => v.toString(),
    trend: null,
  },
  {
    key: "fleet_avg_vhi" as const,
    label: "Fleet Avg VHI",
    icon: Activity,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    accentColor: "bg-emerald-500",
    format: (v: number) => v.toFixed(1),
    trend: "vhi",
  },
  {
    key: "inspections_this_month" as const,
    label: "Inspections This Month",
    icon: Calendar,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    accentColor: "bg-violet-500",
    format: (v: number) => v.toString(),
    trend: null,
  },
  {
    key: "open_deficiencies" as const,
    label: "Open Deficiencies",
    icon: AlertTriangle,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    accentColor: "bg-amber-500",
    format: (v: number) => v.toString(),
    trend: "deficiencies",
  },
];

function VHIGrade({ score }: { score: number }) {
  const grade =
    score >= 90 ? { label: "A", color: "text-emerald-600 bg-emerald-50" } :
    score >= 75 ? { label: "B", color: "text-blue-600 bg-blue-50" } :
    score >= 60 ? { label: "C", color: "text-amber-600 bg-amber-50" } :
    { label: "D", color: "text-red-600 bg-red-50" };
  return (
    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${grade.color}`}>
      Grade {grade.label}
    </span>
  );
}

export function FleetSummaryCards({ data }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const rawValue = data ? data[card.key] : null;
        const displayValue = rawValue !== null && rawValue !== undefined
          ? card.format(rawValue as number)
          : "—";

        return (
          <div
            key={card.key}
            className="bg-white rounded-xl border border-slate-200 p-5 relative overflow-hidden"
          >
            {/* Colored accent bottom line */}
            <div className={`absolute bottom-0 left-0 right-0 h-[3px] ${card.accentColor} opacity-60`} />

            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`w-[18px] h-[18px] ${card.iconColor}`} />
              </div>
              {card.key === "fleet_avg_vhi" && data && (
                <VHIGrade score={data.fleet_avg_vhi} />
              )}
              {card.key === "open_deficiencies" && data && data.open_deficiencies > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                  <TrendingUp className="w-3 h-3" /> Active
                </span>
              )}
              {card.key === "open_deficiencies" && data && data.open_deficiencies === 0 && (
                <span className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  <TrendingDown className="w-3 h-3" /> Clear
                </span>
              )}
            </div>

            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums leading-none">{displayValue}</p>
          </div>
        );
      })}
    </div>
  );
}
