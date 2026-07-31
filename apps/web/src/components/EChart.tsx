"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { ECharts, EChartsOption } from "echarts";

export default function EChart({
  option,
  height = 360,
  onReady,
}: {
  option: EChartsOption;
  height?: number;
  onReady?: (chart: ECharts) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const chart = echarts.init(elRef.current);
    chartRef.current = chart;
    onReady?.(chart);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={elRef} style={{ width: "100%", height }} />;
}
