import { classNames, formatNumber, formatPeriod, formatRate } from "@/lib/utils";
import type { Kpi } from "@/types/api";

const STATUS_STYLES = {
  up: "text-red-600",
  down: "text-blue-600",
  flat: "text-gray-500",
} as const;

function direction(v: number | null): "up" | "down" | "flat" {
  if (v === null || v === undefined || Math.abs(v) < 0.05) return "flat";
  return v > 0 ? "up" : "down";
}

export default function SummaryCard({ kpi }: { kpi: Kpi }) {
  const mom = direction(kpi.mom_rate);
  const yoy = direction(kpi.yoy_rate);
  const arrow = (d: "up" | "down" | "flat") => (d === "up" ? "▲" : d === "down" ? "▼" : "■");
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-gray-600">{kpi.name}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">
        {formatNumber(kpi.value)}
        <span className="ml-1 text-sm font-normal text-gray-500">{kpi.unit}</span>
      </div>
      <div className="mt-1 text-xs text-gray-500">対象: {formatPeriod(kpi.period)}</div>
      <div className="mt-2 flex gap-3 text-xs">
        <span className={classNames(STATUS_STYLES[mom], "inline-flex items-center gap-0.5")}>
          {arrow(mom)} 前月比 {formatRate(kpi.mom_rate)}
        </span>
        <span className={classNames(STATUS_STYLES[yoy], "inline-flex items-center gap-0.5")}>
          {arrow(yoy)} 前年比 {formatRate(kpi.yoy_rate)}
        </span>
      </div>
    </div>
  );
}
