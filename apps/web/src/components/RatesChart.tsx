"use client";

import type { EChartsOption } from "echarts";
import type { Series } from "@/types/api";
import EChart from "./EChart";

export default function RatesChart({ seriesList }: { seriesList: Series[] }) {
  const periods = sortedPeriods(seriesList);
  const first = seriesList[0];
  const mom = periods.map((p) => first?.points.find((x) => x.period === p)?.mom_rate ?? null);
  const yoy = periods.map((p) => first?.points.find((x) => x.period === p)?.yoy_rate ?? null);
  const option: EChartsOption = {
    legend: { bottom: 0 },
    tooltip: { trigger: "axis", valueFormatter: (v) => (typeof v === "number" ? `${v.toFixed(1)}%` : "—") },
    grid: { left: 48, right: 16, top: 20, bottom: 48 },
    xAxis: { type: "category", data: periods, axisLabel: { rotate: 30 } },
    yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
    series: [
      { name: "前月比", type: "bar", data: mom, itemStyle: { color: "#E08A2B" } },
      { name: "前年比", type: "bar", data: yoy, itemStyle: { color: "#2E5AAC" } },
    ],
  };
  return <EChart option={option} height={260} />;
}

function sortedPeriods(seriesList: Series[]): string[] {
  const set = new Set<string>();
  for (const s of seriesList) for (const p of s.points) set.add(p.period);
  return [...set].sort();
}
