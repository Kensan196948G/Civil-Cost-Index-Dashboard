import { classNames, formatPeriod, formatRate } from "@/lib/utils";
import type { DashboardAlert } from "@/types/api";

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-red-300 bg-red-50 text-red-800",
  medium: "border-amber-300 bg-amber-50 text-amber-800",
  low: "border-gray-200 bg-gray-50 text-gray-700",
};

export default function AlertList({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) {
    return <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">注目変動はありません</div>;
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li key={i} className={classNames("rounded-lg border p-3 text-sm", PRIORITY_STYLES[a.priority] ?? PRIORITY_STYLES.low)}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">
              {a.item_name}｜{a.region_name}
            </span>
            <span className="text-xs text-gray-500">{formatPeriod(a.period)}</span>
          </div>
          <div className="mt-1 text-xs">
            前月比 {formatRate(a.mom_rate)} / 前年比 {formatRate(a.yoy_rate)} / {a.reason}
          </div>
        </li>
      ))}
    </ul>
  );
}
