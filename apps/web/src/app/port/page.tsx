"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { PortEstimate, PortWorkType, Vessel } from "@/types/api";

export default function PortPage() {
  const [workTypes, setWorkTypes] = useState<PortWorkType[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [workTypeId, setWorkTypeId] = useState("");
  const [quantity, setQuantity] = useState("10000");
  const [operationRate, setOperationRate] = useState("0.7");
  const [mobilizationDays, setMobilizationDays] = useState("2");
  const [estimate, setEstimate] = useState<PortEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, v] = await Promise.all([api.portWorkTypes(), api.portVessels()]);
      setWorkTypes(w.work_types);
      setVessels(v.vessels);
      if (!workTypeId && w.work_types[0]) setWorkTypeId(w.work_types[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [workTypeId]);

  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setEstimating(true);
    setNotice(null);
    try {
      const res = await api.portEstimate({
        work_type_id: workTypeId,
        quantity: Number(quantity),
        operation_rate: Number(operationRate),
        mobilization_days: Number(mobilizationDays),
      });
      setEstimate(res.estimate);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "試算に失敗しました");
    } finally {
      setEstimating(false);
    }
  };

  const selected = workTypes.find((t) => t.id === workTypeId);
  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">港湾工事コストモデル（PoC）</h1>
      <p className="text-sm text-gray-600">
        浚渫・ケーソン・基礎捨石の3工種を対象に、作業船の損料・稼働率・回航費・待機費を簡易試算します。
        <span className="text-amber-700"> PoC用の仮定値であり、港湾請負工事積算基準（令和8年度）の正式係数への置き換えが必要です。</span>
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">試算条件</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>工種*</label>
                  <select className={inputCls} value={workTypeId} onChange={(e) => setWorkTypeId(e.target.value)}>
                    {workTypes.map((t) => <option key={t.id} value={t.id}>{t.work_type_name}</option>)}
                  </select>
                  {selected?.description && <div className="mt-1 text-xs text-gray-500">{selected.description}</div>}
                </div>
                <div>
                  <label className={labelCls}>数量*（単位: {selected?.unit ?? "—"}）</label>
                  <input className={inputCls} type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>稼働率（海上施工可能日数考慮）</label>
                  <input className={inputCls} type="number" min={0.1} max={1} step={0.05} value={operationRate} onChange={(e) => setOperationRate(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>回航・えい航日数</label>
                  <input className={inputCls} type="number" min={0} max={60} value={mobilizationDays} onChange={(e) => setMobilizationDays(e.target.value)} />
                </div>
                <button onClick={() => void run()} disabled={estimating} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {estimating ? "試算中…" : "試算する"}
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="mb-2 text-base font-semibold">試算結果</h2>
              {!estimate && <div className="py-8 text-center text-sm text-gray-400">条件を入力して試算してください</div>}
              {estimate && (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                        <th className="py-2">作業船</th><th>区分</th><th>1日能力</th>
                        <th>稼働日数</th><th>待機日数</th><th>損料</th><th>回航費</th><th>合計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estimate.result.rows.map((r) => (
                        <tr key={r.vessel_code} className="border-b border-gray-100">
                          <td className="py-2">{r.vessel_name}</td>
                          <td className="py-2 text-xs">{r.category}</td>
                          <td className="py-2 text-right text-xs">{formatNumber(r.daily_output)}</td>
                          <td className="py-2 text-right">{r.work_days}</td>
                          <td className="py-2 text-right">{r.standby_days}</td>
                          <td className="py-2 text-right">{formatNumber(r.hire_cost)}</td>
                          <td className="py-2 text-right">{formatNumber(r.mobilization_cost)}</td>
                          <td className="py-2 text-right font-semibold">{formatNumber(r.total_cost)}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-gray-100">
                        <td colSpan={7} className="py-2 text-right font-semibold">合計（円）</td>
                        <td className="py-2 text-right font-bold text-blue-700">{formatNumber(estimate.result.total_cost)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-1 text-xs font-semibold text-gray-600">算定前提</div>
                    <ul className="list-inside list-disc space-y-0.5 text-xs text-gray-600">
                      {estimate.result.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">船舶マスタ（PoC仮定値）</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                  <th className="py-2">船舶</th><th>区分</th><th>能力</th><th>損料（円/日）</th>
                  <th>供用係数</th><th>回航日数</th><th>備考</th>
                </tr>
              </thead>
              <tbody>
                {vessels.map((v) => (
                  <tr key={v.id} className="border-b border-gray-100">
                    <td className="py-2">{v.vessel_name}</td>
                    <td className="py-2 text-xs">{v.category}</td>
                    <td className="py-2 text-xs">{v.capacity != null ? `${formatNumber(v.capacity)} ${v.capacity_unit ?? ""}` : "—"}</td>
                    <td className="py-2 text-right">{formatNumber(v.hire_rate_per_day)}</td>
                    <td className="py-2 text-right">{v.availability_factor}</td>
                    <td className="py-2 text-right">{v.mobilization_days}</td>
                    <td className="py-2 text-xs text-gray-500">{v.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
