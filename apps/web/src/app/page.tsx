"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AlertList from "@/components/AlertList";
import SourceBadge from "@/components/SourceBadge";
import { ErrorMessage, LoadingState } from "@/components/Status";
import SummaryCard from "@/components/SummaryCard";
import TrendChart from "@/components/TrendChart";
import { api } from "@/lib/api";
import { formatDateTime, formatPeriod, loadPrefs, savePrefs } from "@/lib/utils";
import type { DashboardSummary, Region, Series } from "@/types/api";

export default function DashboardPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<string>("");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .regions()
      .then((r) => {
        setRegions(r.regions);
        const prefs = loadPrefs();
        const defaultRegion = r.regions.find((x) => x.region_code === (prefs.regionCode ?? "JP-01")) ?? r.regions[0];
        setRegionId(defaultRegion?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async (rid: string) => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.dashboardSummary({ region_id: rid || undefined, period: "3y" });
      setSummary(s);
      const items = await api.items("MATERIAL_PRICE");
      const ts = await api.timeseries({
        data_type: "MATERIAL_PRICE",
        item_ids: items.items.slice(0, 3).map((i) => i.id).join(","),
        region_ids: rid || undefined,
        normalize: true,
      });
      setSeries(ts.series);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (regionId !== undefined && regions.length > 0) void load(regionId);
  }, [regionId, regions.length, load]);

  const onRegionChange = (rid: string) => {
    setRegionId(rid);
    const r = regions.find((x) => x.id === rid);
    if (r) savePrefs({ ...loadPrefs(), regionCode: r.region_code });
  };

  const sourceNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of series) names.add(s.source_name);
    return [...names];
  }, [series]);

  if (error) return <ErrorMessage message={error} onRetry={() => void load(regionId)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">トップダッシュボード</h1>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-600">地域</label>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5"
            value={regionId}
            onChange={(e) => onRegionChange(e.target.value)}
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.region_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <LoadingState />}
      {!loading && summary && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <div className="text-xs text-gray-500">最新対象年月</div>
                <div className="text-lg font-semibold">{formatPeriod(summary.latest_period)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">データ最終更新</div>
                <div className="text-lg font-semibold">{formatDateTime(summary.last_updated_at)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">注目変動</div>
                <div className="text-lg font-semibold">{summary.alerts.length} 件</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">データソース</div>
                <div className="text-lg font-semibold">{summary.update_status.length} 件</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {summary.kpis.map((k) => (
              <SummaryCard key={k.name} kpi={k} />
            ))}
            {summary.kpis.length === 0 && <div className="text-sm text-gray-500 md:col-span-4">KPIデータがありません</div>}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">主要資材価格トレンド（指数・基準100）</h2>
            {series.length > 0 ? <TrendChart seriesList={series} /> : <div className="text-sm text-gray-500">グラフデータがありません</div>}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
              {sourceNames.map((n) => (
                <SourceBadge key={n} name={n} url={null} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">注目変動</h2>
              <AlertList alerts={summary.alerts} />
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">データ更新状況</h2>
              <table className="w-full text-sm">
                <tbody>
                  {summary.update_status.map((u, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2">{u.data_source_name}</td>
                      <td className="py-2 text-right text-xs text-gray-500">{formatDateTime(u.last_fetched_at)}</td>
                      <td className="py-2 text-right">
                        <span className={`rounded px-2 py-0.5 text-xs ${u.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {u.status === "success" ? "正常" : u.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {summary.update_status.length === 0 && (
                    <tr>
                      <td className="py-4 text-center text-gray-500">データソースがありません</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
