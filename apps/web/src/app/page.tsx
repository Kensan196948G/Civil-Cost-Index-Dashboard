"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AlertList from "@/components/AlertList";
import RangeBandChart, { type BandPoint } from "@/components/RangeBandChart";
import RatesChart from "@/components/RatesChart";
import { ErrorMessage, LoadingState } from "@/components/Status";
import SummaryCard from "@/components/SummaryCard";
import TrendChart from "@/components/TrendChart";
import { api } from "@/lib/api";
import { classNames, formatDateTime, formatPeriod, loadPrefs, savePrefs } from "@/lib/utils";
import type { DashboardSummary, Item, Region, Series } from "@/types/api";

type KpiMode = "cards" | "charts" | "list";

export default function DashboardPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [regionId, setRegionId] = useState("");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trend, setTrend] = useState<Series[]>([]);
  const [band, setBand] = useState<BandPoint[]>([]);
  const [kpiMode, setKpiMode] = useState<KpiMode>("cards");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (ridParam?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [regs, its] = await Promise.all([api.regions(), api.items("MATERIAL_PRICE")]);
      setRegions(regs.regions);
      setItems(its.items);
      const prefs = loadPrefs();
      const defaultRegion = regs.regions.find((r) => r.region_code === (prefs.regionCode ?? "JP-01")) ?? regs.regions[0];
      const rid = ridParam ?? defaultRegion?.id ?? "";
      setRegionId(rid);
      const s = await api.dashboardSummary({ region_id: rid || undefined, period: "3y" });
      setSummary(s);
      const topItems = its.items.slice(0, 3);
      const ts = await api.timeseries({
        data_type: "MATERIAL_PRICE",
        item_ids: topItems.map((i) => i.id).join(","),
        region_ids: rid || undefined,
        normalize: true,
      });
      setTrend(ts.series);
      if (topItems[0]) {
        const raw = await api.timeseries({
          data_type: "MATERIAL_PRICE",
          item_ids: topItems[0].id,
          normalize: false,
        });
        const byPeriod = new Map<string, number[]>();
        for (const s of raw.series) {
          for (const p of s.points) {
            const arr = byPeriod.get(p.period) ?? [];
            arr.push(p.raw_value);
            byPeriod.set(p.period, arr);
          }
        }
        setBand(
          [...byPeriod.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([period, vals]) => ({
              period,
              min: Math.min(...vals),
              max: Math.max(...vals),
              avg: vals.reduce((a, b) => a + b, 0) / vals.length,
            }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRegionChange = (rid: string) => {
    setRegionId(rid);
    const r = regions.find((x) => x.id === rid);
    if (r) savePrefs({ ...loadPrefs(), regionCode: r.region_code });
    void load(rid);
  };

  const sources = summary?.update_status ?? [];
  const sourceNames = useMemo(() => [...new Set(trend.map((s) => s.source_name))], [trend]);

  if (error) return <ErrorMessage message={error} onRetry={() => void load(regionId)} />;

  return (
    <div className="space-y-4">
      {/* ステータスバー */}
      <div className="cci-card grid grid-cols-2 gap-3 p-4 text-sm md:grid-cols-5">
        <div>
          <div className="text-[11px] text-gray-400">最新対象年月</div>
          <div className="mt-0.5 font-semibold">{formatPeriod(summary?.latest_period)}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">最終取込</div>
          <div className="mt-0.5 font-semibold">{formatDateTime(summary?.last_updated_at)}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">対象地域</div>
          <select className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm" value={regionId} onChange={(e) => onRegionChange(e.target.value)}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.region_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">注目変動</div>
          <div className="mt-0.5 font-semibold">{summary?.alerts.length ?? 0} 件</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">稼働データソース</div>
          <div className="mt-0.5 font-semibold">{sources.filter((s) => s.status === "success").length} 件</div>
        </div>
      </div>

      {loading && <LoadingState />}
      {!loading && summary && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-800">主要指標（前年同月比つき）</h2>
            <div className="flex gap-1 text-xs">
              {(["cards", "charts", "list"] as KpiMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setKpiMode(m)}
                  className={classNames(
                    "rounded-md px-2.5 py-1",
                    kpiMode === m ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200"
                  )}
                >
                  {m === "cards" ? "A 数値中心" : m === "charts" ? "B グラフ重視" : "C 一覧圧縮"}
                </button>
              ))}
            </div>
          </div>

          {kpiMode === "cards" && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {summary.kpis.map((k) => (
                <SummaryCard key={k.name} kpi={k} />
              ))}
              {summary.kpis.length === 0 && <div className="cci-card p-6 text-sm text-gray-500 md:col-span-4">KPIデータがありません</div>}
            </div>
          )}
          {kpiMode === "list" && (
            <div className="cci-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-4 py-2">指標</th>
                    <th className="px-4 py-2 text-right">値</th>
                    <th className="px-4 py-2 text-right">前月比</th>
                    <th className="px-4 py-2 text-right">前年比</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.kpis.map((k) => (
                    <tr key={k.name} className="border-b border-gray-50">
                      <td className="px-4 py-2 font-medium">{k.name}</td>
                      <td className="px-4 py-2 text-right">{k.value.toLocaleString("ja-JP")} {k.unit}</td>
                      <td className={`px-4 py-2 text-right ${(k.mom_rate ?? 0) >= 0 ? "text-red-600" : "text-blue-600"}`}>{k.mom_rate == null ? "—" : `${k.mom_rate > 0 ? "+" : ""}${k.mom_rate}%`}</td>
                      <td className={`px-4 py-2 text-right ${(k.yoy_rate ?? 0) >= 0 ? "text-red-600" : "text-blue-600"}`}>{k.yoy_rate == null ? "—" : `${k.yoy_rate > 0 ? "+" : ""}${k.yoy_rate}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="cci-card p-4 xl:col-span-2">
              <h3 className="mb-2 text-sm font-semibold text-gray-800">主要資材価格トレンド（指数・基準100）</h3>
              {trend.length > 0 ? <TrendChart seriesList={trend} /> : <div className="py-8 text-center text-sm text-gray-400">データがありません</div>}
              {sourceNames.length > 0 && <div className="mt-2 text-[11px] text-gray-400">出典：{sourceNames.join("／")}</div>}
            </div>
            <div className="space-y-4">
              <div className="cci-card p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">注目変動</h3>
                <AlertList alerts={summary.alerts} />
              </div>
              <div className="cci-card p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">稼働データソース</h3>
                <table className="w-full text-xs">
                  <tbody>
                    {sources.slice(0, 6).map((u, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5">{u.data_source_name}</td>
                        <td className="py-1.5 text-right text-gray-400">{formatDateTime(u.last_fetched_at)}</td>
                        <td className="py-1.5 text-right">
                          <span className={`rounded px-1.5 py-0.5 ${u.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {u.status === "success" ? "正常" : u.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {kpiMode === "charts" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="cci-card p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">変動率（前月比・前年比）</h3>
                {trend.length > 0 ? <RatesChart seriesList={trend} /> : <div className="py-8 text-center text-sm text-gray-400">データがありません</div>}
              </div>
              <div className="cci-card p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-800">地域間レンジ帯（{items[0]?.item_name ?? ""}・全地域）</h3>
                {band.length > 0 ? <RangeBandChart data={band} /> : <div className="py-8 text-center text-sm text-gray-400">データがありません</div>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
