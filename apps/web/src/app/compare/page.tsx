"use client";

import { useCallback, useEffect, useState } from "react";
import CompareChart from "@/components/CompareChart";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api, CATEGORY_LABELS } from "@/lib/api";
import type { DataCategory, Item, Region, Series } from "@/types/api";

interface SeriesToken {
  dataType: DataCategory;
  itemCode: string;
  regionCode: string;
}

export default function ComparePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [tokens, setTokens] = useState<SeriesToken[]>([{ dataType: "MATERIAL_PRICE", itemCode: "", regionCode: "" }]);
  const [normalize, setNormalize] = useState(true);
  const [basePeriod, setBasePeriod] = useState("");
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.items().then((r) => setItems(r.items)).catch((e) => setError(e.message));
    void api.regions().then((r) => setRegions(r.regions)).catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async (toks: SeriesToken[], norm: boolean, base: string) => {
    const valid = toks.filter((t) => t.itemCode && t.regionCode);
    if (valid.length === 0) {
      setSeries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.compare({
        series: valid.map((t) => `${t.dataType}:${t.itemCode}:${t.regionCode}`).join(","),
        normalize: norm,
        base_period: base || undefined,
      });
      setSeries(res.series);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateToken = (idx: number, patch: Partial<SeriesToken>) => {
    const next = tokens.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    setTokens(next);
    void load(next, normalize, basePeriod);
  };

  const addToken = () => {
    if (tokens.length >= 10) return;
    const next = [...tokens, { dataType: "MATERIAL_PRICE" as DataCategory, itemCode: "", regionCode: "" }];
    setTokens(next);
  };

  const removeToken = (idx: number) => {
    const next = tokens.filter((_, i) => i !== idx);
    setTokens(next);
    void load(next, normalize, basePeriod);
  };

  useEffect(() => {
    if (items.length === 0 || regions.length === 0) return;
    setTokens((prev) =>
      prev.map((t) => ({
        ...t,
        itemCode: t.itemCode || (items.find((i) => i.category === t.dataType)?.item_code ?? ""),
        regionCode: t.regionCode || (regions.find((r) => r.region_code === "JP-01")?.region_code ?? ""),
      }))
    );
  }, [items, regions]);

  const ranking = [...series]
    .map((s) => {
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      const change =
        first && last && first.value != null && last.value != null
          ? ((last.value - first.value) / first.value) * 100
          : null;
      return { label: s.label, change };
    })
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0));

  const selectCls = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">比較分析</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {tokens.map((t, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded border border-gray-100 p-3 md:grid-cols-4">
              <div>
                <label className={labelCls}>分類</label>
                <select
                  className={selectCls}
                  value={t.dataType}
                  onChange={(e) => {
                    const dt = e.target.value as DataCategory;
                    updateToken(i, { dataType: dt, itemCode: items.find((x) => x.category === dt)?.item_code ?? "" });
                  }}
                >
                  {(Object.keys(CATEGORY_LABELS) as DataCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>品目</label>
                <select className={selectCls} value={t.itemCode} onChange={(e) => updateToken(i, { itemCode: e.target.value })}>
                  {items.filter((x) => x.category === t.dataType).map((x) => (
                    <option key={x.id} value={x.item_code}>
                      {x.item_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>地域</label>
                <select className={selectCls} value={t.regionCode} onChange={(e) => updateToken(i, { regionCode: e.target.value })}>
                  {regions.map((r) => (
                    <option key={r.id} value={r.region_code}>
                      {r.region_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => removeToken(i)} disabled={tokens.length <= 1} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-40">
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <button onClick={addToken} disabled={tokens.length >= 10} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40">
            ＋ 系列追加（最大10件）
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={normalize} onChange={(e) => { setNormalize(e.target.checked); void load(tokens, e.target.checked, basePeriod); }} className="h-4 w-4" />
            指数化（基準=100）
          </label>
          <label className="text-sm">
            基準年月
            <input type="month" className="ml-2 rounded-md border border-gray-300 px-2 py-1.5" value={basePeriod} disabled={!normalize} onChange={(e) => { setBasePeriod(e.target.value); void load(tokens, normalize, e.target.value); }} />
          </label>
        </div>
      </div>
      {error && <ErrorMessage message={error} onRetry={() => void load(tokens, normalize, basePeriod)} />}
      {loading && <LoadingState />}
      {!loading && series.length > 0 && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">{normalize ? "指数比較（基準=100）" : "実数比較"}</h2>
            <CompareChart seriesList={series} />
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">期間内変動ランキング</h2>
            <table className="w-full text-sm">
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2">{i + 1}. {r.label}</td>
                    <td className={`py-2 text-right font-semibold ${(r.change ?? 0) > 0 ? "text-red-600" : (r.change ?? 0) < 0 ? "text-blue-600" : "text-gray-500"}`}>
                      {r.change === null ? "—" : `${r.change > 0 ? "+" : ""}${r.change.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!loading && series.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">品目と地域を選択して「比較」を実行してください</div>
      )}
    </div>
  );
}
