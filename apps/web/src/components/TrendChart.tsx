"use client";

import type { EChartsOption } from "echarts";
import type { Series } from "@/types/api";
import EChart from "./EChart";

const PALETTE = ["#d9534f", "#4a90d9", "#5cb85c", "#f0ad4e", "#8e44ad", "#16a085", "#d35400", "#2c3e50", "#7f8c8d", "#e74c3c"];

export default function TrendChart({
  seriesList,
  chartType = "line",
  onReady,
}: {
  seriesList: Series[];
  chartType?: "line" | "bar" | "mixed";
  onReady?: (chart: import("echarts").ECharts) => void;
}) {
  const option: EChartsOption = {
    color: PALETTE,
    legend: { type: "scroll", bottom: 0 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => (typeof v === "number" ? v.toLocaleString("ja-JP") : String(v ?? "—")),
    },
    grid: { left: 60, right: 24, top: 30, bottom: 56 },
    xAxis: {
      type: "category",
      data: sortedPeriods(seriesList),
      axisLabel: { rotate: 30 },
    },
    yAxis: { type: "value", scale: true },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 20 }],
    series: seriesList.map((s, i) => ({
      name: s.label,
      type: chartType === "bar" && i % 2 === 1 ? "bar" : "line",
      connectNulls: false,
      symbol: "circle",
      symbolSize: 5,
      data: sortedPeriods(seriesList).map((p) => {
        const pt = s.points.find((x) => x.period === p);
        return pt ? { value: pt.value, status: pt.status } : null;
      }),
    })),
  };

  return <EChart option={option} height={420} onReady={onReady} />;
}

function sortedPeriods(seriesList: Series[]): string[] {
  const set = new Set<string>();
  for (const s of seriesList) for (const p of s.points) set.add(p.period);
  return [...set].sort();
}
