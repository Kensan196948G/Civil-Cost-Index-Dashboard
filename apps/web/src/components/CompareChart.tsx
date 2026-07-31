"use client";

import type { EChartsOption } from "echarts";
import type { Series } from "@/types/api";
import EChart from "./EChart";

export default function CompareChart({
  seriesList,
  onReady,
}: {
  seriesList: Series[];
  onReady?: (chart: import("echarts").ECharts) => void;
}) {
  const periods = sortedPeriods(seriesList);
  const option: EChartsOption = {
    legend: { type: "scroll", bottom: 0 },
    tooltip: { trigger: "axis" },
    grid: { left: 60, right: 24, top: 30, bottom: 56 },
    xAxis: { type: "category", data: periods, axisLabel: { rotate: 30 } },
    yAxis: { type: "value", scale: true },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 20 }],
    series: seriesList.map((s) => ({
      name: s.label,
      type: "line",
      connectNulls: false,
      symbol: "circle",
      symbolSize: 5,
      data: periods.map((p) => s.points.find((x) => x.period === p)?.value ?? null),
    })),
  };
  return <EChart option={option} height={420} onReady={onReady} />;
}

function sortedPeriods(seriesList: Series[]): string[] {
  const set = new Set<string>();
  for (const s of seriesList) for (const p of s.points) set.add(p.period);
  return [...set].sort();
}
