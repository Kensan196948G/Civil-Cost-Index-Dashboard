"use client";

import type { EChartsOption } from "echarts";
import EChart from "./EChart";

export interface BandPoint {
  period: string;
  min: number;
  max: number;
  avg: number;
}

export default function RangeBandChart({ data }: { data: BandPoint[] }) {
  const periods = data.map((d) => d.period);
  const lower = data.map((d) => d.min);
  const band = data.map((d) => d.max - d.min);
  const avg = data.map((d) => d.avg);
  const option: EChartsOption = {
    legend: { bottom: 0 },
    tooltip: { trigger: "axis" },
    grid: { left: 64, right: 16, top: 20, bottom: 48 },
    xAxis: { type: "category", data: periods, axisLabel: { rotate: 30 } },
    yAxis: { type: "value", scale: true },
    series: [
      { name: "下限", type: "line", data: lower, stack: "band", lineStyle: { opacity: 0 }, symbol: "none", tooltip: { show: false } },
      { name: "地域差", type: "line", data: band, stack: "band", areaStyle: { color: "rgba(46,90,172,0.25)" }, lineStyle: { opacity: 0 }, symbol: "none", tooltip: { show: false } },
      { name: "平均", type: "line", data: avg, itemStyle: { color: "#E08A2B" }, symbol: "circle", symbolSize: 4 },
    ],
  };
  return <EChart option={option} height={260} />;
}
