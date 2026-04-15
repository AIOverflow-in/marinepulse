"use client";

import { Deficiency } from "@/types";

interface Props {
  data: Deficiency[];
}

const CATEGORY_COLORS: Record<string, string> = {
  "Engine Room & Machinery": "bg-orange-50 text-orange-700 ring-orange-200",
  "Safety & Firefighting Equipment": "bg-red-50 text-red-700 ring-red-200",
  "Bridge & Navigation": "bg-blue-50 text-blue-700 ring-blue-200",
  "Hull & Structural Integrity": "bg-teal-50 text-teal-700 ring-teal-200",
  "Cargo Handling Systems": "bg-amber-50 text-amber-700 ring-amber-200",
  "Pollution Prevention": "bg-green-50 text-green-700 ring-green-200",
  "Electrical Systems": "bg-violet-50 text-violet-700 ring-violet-200",
  "Ballast & Stability": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "Accommodation & Living Spaces": "bg-pink-50 text-pink-700 ring-pink-200",
  "Emergency Preparedness": "bg-rose-50 text-rose-700 ring-rose-200",
};

function shortCategory(cat: string) {
  const map: Record<string, string> = {
    "Engine Room & Machinery": "Engine Room",
    "Safety & Firefighting Equipment": "Safety",
    "Bridge & Navigation": "Bridge",
    "Hull & Structural Integrity": "Hull",
    "Cargo Handling Systems": "Cargo",
    "Pollution Prevention": "Pollution",
    "Electrical Systems": "Electrical",
    "Ballast & Stability": "Ballast",
    "Accommodation & Living Spaces": "Accomm.",
    "Emergency Preparedness": "Emergency",
    "Deck Machinery & Fittings": "Deck",
  };
  return map[cat] || cat.split(" ")[0];
}

function RateBar({ rate }: { rate: number }) {
  const color = rate >= 25 ? "bg-red-500" : rate >= 15 ? "bg-amber-500" : "bg-slate-300";
  const textColor = rate >= 25 ? "text-red-600" : rate >= 15 ? "text-amber-600" : "text-slate-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-slate-100 rounded-full h-1.5 flex-shrink-0">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
        {rate.toFixed(0)}%
      </span>
    </div>
  );
}

function AvgScore({ score }: { score: number }) {
  const color = score >= 4 ? "text-emerald-600" : score >= 3 ? "text-blue-600" : score >= 2 ? "text-amber-600" : "text-red-600";
  return (
    <span className={`text-xs font-semibold tabular-nums ${color}`}>{score.toFixed(1)}<span className="text-slate-400 font-normal">/5</span></span>
  );
}

export function DeficiencyHeatmap({ data }: Props) {
  if (!data.length) return (
    <div className="text-center text-slate-400 py-8 text-sm">No deficiencies found</div>
  );

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-7">#</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Item</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Category</th>
            <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-14">Fails</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Rate</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Score</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((d, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
              <td className="px-3 py-2.5 text-slate-400 text-[11px] tabular-nums">{i + 1}</td>
              <td className="px-3 py-2.5">
                <span
                  className="text-slate-700 text-xs font-medium line-clamp-2 max-w-[200px] block"
                  title={d.item_name}
                >
                  {d.item_name}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ring-1 whitespace-nowrap ${CATEGORY_COLORS[d.category] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                  {shortCategory(d.category)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-center">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-red-700 text-[11px] font-bold ring-1 ring-red-100">
                  {d.deficiency_count}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <RateBar rate={d.failure_rate} />
              </td>
              <td className="px-3 py-2.5">
                <AvgScore score={d.avg_score} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
