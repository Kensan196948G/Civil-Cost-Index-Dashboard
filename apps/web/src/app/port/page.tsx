"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { PortEstimate, PortWorkType, SeaCondition, Vessel, WorkabilityResult } from "@/types/api";

export default function PortPage() {
  const [workTypes, setWorkTypes] = useState<PortWorkType[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [seaConditions, setSeaConditions] = useState<SeaCondition[]>([]);
  const [seaArea, setSeaArea] = useState("SEA_TOKYO_BAY");
  const [workForm, setWorkForm] = useState({ month: "8", wave_height: "", wind_speed: "" });
  const [workability, setWorkability] = useState<WorkabilityResult | null>(null);
  const [seaForm, setSeaForm] = useState({ sea_area_code: "SEA_TOKYO_BAY", sea_area_name: "東京湾", target_month: "1", workable_days: "20" });
  const [importVesselFile, setImportVesselFile] = useState<File | null>(null);
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
      const [w, v, s] = await Promise.all([api.portWorkTypes(), api.portVessels(), api.seaConditions()]);
      setWorkTypes(w.work_types);
      setVessels(v.vessels);
      setSeaConditions(s.sea_conditions);
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

  const calcWorkability = async () => {
    setNotice(null);
    try {
      const res = await api.computeWorkability({
        sea_area_code: seaArea,
        target_month: Number(workForm.month),
        wave_height: workForm.wave_height ? Number(workForm.wave_height) : null,
        wind_speed: workForm.wind_speed ? Number(workForm.wind_speed) : null,
      });
      setWorkability(res.workability);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "施工可能日数の算定に失敗しました");
    }
  };

  const saveSea = async () => {
    setNotice(null);
    try {
      await api.upsertSeaCondition({
        sea_area_code: seaForm.sea_area_code,
        sea_area_name: seaForm.sea_area_name,
        target_month: Number(seaForm.target_month),
        workable_days: Number(seaForm.workable_days),
      });
      setNotice("海象条件を登録しました。");
      const s = await api.seaConditions();
      setSeaConditions(s.sea_conditions);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const doImportVessels = async () => {
    setNotice(null);
    if (!importVesselFile) return;
    try {
      const res = await api.importVessels(importVesselFile);
      setNotice(`船舶マスタ取込完了: ${res.result.imported}件 ／ エラー ${res.result.errors.length}件`);
      const v = await api.portVessels();
      setVessels(v.vessels);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取込に失敗しました");
    }
  };

  const selected = workTypes.find((t) => t.id === workTypeId);
  const seaAreaList = seaConditions.filter((s) => s.sea_area_code === seaArea);
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
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">船舶マスタ取込（正式係数データの投入）</h2>
            <p className="mb-2 text-xs text-gray-500">
              CSV/Excel列: vessel_code, vessel_name, category, capacity, capacity_unit, hire_rate_per_day, availability_factor, mobilization_days, standby_rate, note
            </p>
            <div className="flex items-center gap-3">
              <input type="file" accept=".csv,.xlsx" className="text-sm" onChange={(e) => setImportVesselFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => void doImportVessels()} disabled={!importVesselFile} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
                取込
              </button>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">海象条件・海上施工可能日数</h2>
              <div className="mb-2 flex items-center gap-2">
                <select className={inputCls} value={seaArea} onChange={(e) => setSeaArea(e.target.value)}>
                  {[...new Set(seaConditions.map((s) => s.sea_area_code))].map((code) => (
                    <option key={code} value={code}>{seaConditions.find((s) => s.sea_area_code === code)?.sea_area_name ?? code}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">月別の施工可能日数（サンプル値）</span>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-1">月</th><th>可能日数</th><th>波高限界</th><th>風速限界</th><th>制限</th></tr></thead>
                <tbody>
                  {seaAreaList.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100">
                      <td className="py-1">{s.target_month}月</td>
                      <td className="py-1">{s.workable_days}日 / {s.calendar_days}日</td>
                      <td className="py-1">{s.wave_height_limit ?? "—"}m</td>
                      <td className="py-1">{s.wind_speed_limit ?? "—"}m/s</td>
                      <td className="py-1">{s.navigation_restriction ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
                <div className="mb-1 text-xs font-semibold text-blue-800">施工可能日数・稼働率の算定</div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" value={workForm.month} onChange={(e) => setWorkForm({ ...workForm, month: e.target.value })}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={String(m)}>{m}月</option>)}
                  </select>
                  <input className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" placeholder="波高(m)" value={workForm.wave_height} onChange={(e) => setWorkForm({ ...workForm, wave_height: e.target.value })} />
                  <input className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" placeholder="風速(m/s)" value={workForm.wind_speed} onChange={(e) => setWorkForm({ ...workForm, wind_speed: e.target.value })} />
                  <button onClick={() => void calcWorkability()} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">算定</button>
                </div>
                {workability && (
                  <div className="mt-2 text-xs text-blue-900">
                    施工可能日数: {workability.workable_days}日（基準 {workability.workable_days_base}日）→ 稼働率 {workability.operation_rate}
                    {workability.warnings.map((w, i) => <div key={i} className="text-amber-700">{w}</div>)}
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">海象条件の登録・更新</h2>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="海域コード*" value={seaForm.sea_area_code} onChange={(e) => setSeaForm({ ...seaForm, sea_area_code: e.target.value })} />
                <input className={inputCls} placeholder="海域名*" value={seaForm.sea_area_name} onChange={(e) => setSeaForm({ ...seaForm, sea_area_name: e.target.value })} />
                <input className={inputCls} type="number" min={1} max={12} placeholder="月*" value={seaForm.target_month} onChange={(e) => setSeaForm({ ...seaForm, target_month: e.target.value })} />
                <input className={inputCls} type="number" min={0} max={31} placeholder="施工可能日数*" value={seaForm.workable_days} onChange={(e) => setSeaForm({ ...seaForm, workable_days: e.target.value })} />
              </div>
              <button onClick={() => void saveSea()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">登録・更新</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
