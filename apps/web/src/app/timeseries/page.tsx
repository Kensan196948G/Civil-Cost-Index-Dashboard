"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ECharts } from "echarts";
import DataTable, { type TableRow } from "@/components/DataTable";
import FilterPanel, { type FilterValues } from "@/components/FilterPanel";
import SourceBadge from "@/components/SourceBadge";
import { ErrorMessage, LoadingState } from "@/components/Status";
import TrendChart from "@/components/TrendChart";
import { api } from "@/lib/api";
import { csvFileName, downloadCsv } from "@/lib/utils";
import type { Item, Region, Series } from "@/types/api";

export default function TimeseriesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [filters, setFilters] = useState<FilterValues>({
    dataType: "MATERIAL_PRICE",
    itemIds: [],
    regionIds: [],
    startPeriod: "",
    endPeriod: "",
    normalize: false,
    basePeriod: "",
    chartType: "line",
  });
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    void api.items().then((r) => setItems(r.items)).catch((e) => setError(e.message));
    void api.regions().then((r) => setRegions(r.regions)).catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async (f: FilterValues) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.timeseries({
        data_type: f.dataType,
        item_ids: f.itemIds.join(",") || undefined,
        region_ids: f.regionIds.join(",") || undefined,
        start_period: f.startPeriod || undefined,
        end_period: f.endPeriod || undefined,
        normalize: f.normalize,
        base_period: f.basePeriod || undefined,
      });
      setSeries(res.series);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  const onFilter = (next: Partial<FilterValues>) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
    void load(merged);
  };

  useEffect(() => {
    if (items.length > 0 && regions.length > 0) {
      const defaults: FilterValues = {
        ...filters,
        itemIds: filters.itemIds.length ? filters.itemIds : items.filter((i) => i.category === filters.dataType).slice(0, 2).map((i) => i.id),
        regionIds: filters.regionIds.length ? filters.regionIds : [regions.find((r) => r.region_code === "JP-01")?.id ?? regions[0]?.id].filter(Boolean) as string[],
      };
      setFilters(defaults);
      void load(defaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, regions.length]);

  const rows: TableRow[] = series.flatMap((s) =>
    s.points.map((p) => ({
      period: p.period,
      label: s.label,
      value: p.value,
      unit: s.unit,
      mom: p.mom_rate,
      yoy: p.yoy_rate,
      status: p.status,
      source: s.source_name,
    }))
  );

  const exportCsv = async () => {
    setNotice(null);
    try {
      await downloadCsv(api.csvExportUrl({
        data_type: filters.dataType,
        item_ids: filters.itemIds.join(",") || undefined,
        region_ids: filters.regionIds.join(",") || undefined,
        start_period: filters.startPeriod || undefined,
        end_period: filters.endPeriod || undefined,
        normalize: filters.normalize,
        base_period: filters.basePeriod || undefined,
      }), csvFileName("cci-timeseries"));
      setNotice("CSVをダウンロードしました。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "CSV出力に失敗しました");
    }
  };

  const exportPng = () => {
    if (!chartRef.current) return;
    const url = chartRef.current.getDataURL({ pixelRatio: 2, backgroundColor: "#fff" });
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName("cci-chart").replace(".csv", ".png");
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">時系列分析</h1>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
            CSV出力
          </button>
          <button onClick={exportPng} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
            PNG出力
          </button>
        </div>
      </div>
      {notice && <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-800">{notice}</div>}
      <FilterPanel values={filters} items={items} regions={regions} onChange={onFilter} />
      {error && <ErrorMessage message={error} onRetry={() => void load(filters)} />}
      {loading && <LoadingState />}
      {!loading && series.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <TrendChart seriesList={series} chartType={filters.chartType} onReady={(c) => { chartRef.current = c; }} />
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
            {[...new Set(series.map((s) => s.source_name))].map((n) => (
              <SourceBadge key={n} name={n} url={series.find((s) => s.source_name === n)?.source_url ?? null} />
            ))}
          </div>
        </div>
      )}
      {!loading && series.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-base font-semibold">データテーブル</h2>
          <DataTable rows={rows} />
        </div>
      )}
      {!loading && series.length === 0 && !error && <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">表示条件に一致するデータがありません</div>}
    </div>
  );
}
