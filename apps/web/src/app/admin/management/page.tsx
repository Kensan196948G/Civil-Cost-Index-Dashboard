"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

type Mgmt = {
  latest_period: string | null;
  kpis: Array<{ name: string; value: number; unit: string; period: string }>;
  alerts_count: number;
  project_count: number;
  project_base_total: number;
  estimate_count: number;
  estimate_total: number;
  quotation_count: number;
  project_profit: Array<{ project_name: string; base_total: number; estimate_total: number; margin_rate: number | null }>;
  project_profit_avg: number | null;
  port_availability: number | null;
  port_estimate_count: number;
  adopted_vs_actual: Array<{ item_name: string; adopted_unit_price: number; actual_median: number | null; ratio: number | null }>;
};

export default function ManagementPage() {
  const [data, setData] = useState<Mgmt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.managementData();
      setData(res.data as unknown as Mgmt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const money = (v: number | null | undefined) => (v == null ? "—" : formatNumber(v));
  const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">経営KPIダッシュボード</h1>
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {data.kpis.map((k) => (
              <div key={k.name} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <div className="text-[11px] text-gray-400">{k.name}（{k.period}）</div>
                <div className="mt-1 text-lg font-bold">{formatNumber(k.value)}</div>
              </div>
            ))}
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-gray-400">注目変動</div>
              <div className="mt-1 text-lg font-bold">{data.alerts_count}件</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-gray-400">案件数</div>
              <div className="mt-1 text-lg font-bold">{data.project_count}件</div>
              <div className="text-xs text-gray-500">ベース額 {money(data.project_base_total)}円</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-gray-400">積算結果</div>
              <div className="mt-1 text-lg font-bold">{data.estimate_count}件</div>
              <div className="text-xs text-gray-500">合計 {money(data.estimate_total)}円</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-gray-400">案件別粗利率（平均）</div>
              <div className="mt-1 text-lg font-bold">{pct(data.project_profit_avg)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-gray-400">港湾稼働率（平均）</div>
              <div className="mt-1 text-lg font-bold">{pct(data.port_availability)}</div>
              <div className="text-xs text-gray-500">積算 {data.port_estimate_count}件</div>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">案件別粗利</h2>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">案件</th><th>ベース額</th><th>積算額</th><th>粗利率</th></tr></thead>
                <tbody>
                  {data.project_profit.map((p) => (
                    <tr key={p.project_name} className="border-b border-gray-100">
                      <td className="py-1">{p.project_name}</td>
                      <td className="py-1 text-right">{money(p.base_total)}</td>
                      <td className="py-1 text-right">{money(p.estimate_total)}</td>
                      <td className="py-1 text-right">{pct(p.margin_rate)}</td>
                    </tr>
                  ))}
                  {data.project_profit.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">積算済み案件がありません</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">採用単価 vs 実績単価</h2>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">品目</th><th>採用単価</th><th>実績中央値</th><th>比率</th></tr></thead>
                <tbody>
                  {data.adopted_vs_actual.map((a) => (
                    <tr key={a.item_name} className="border-b border-gray-100">
                      <td className="py-1">{a.item_name}</td>
                      <td className="py-1 text-right">{money(a.adopted_unit_price)}</td>
                      <td className="py-1 text-right">{money(a.actual_median)}</td>
                      <td className="py-1 text-right">{pct(a.ratio)}</td>
                    </tr>
                  ))}
                  {data.adopted_vs_actual.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">採用単価の記録がありません</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
