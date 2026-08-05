"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { PortEstimate, PortReadiness, PortWorkType, SeaCondition, ShiftRule, SoilType, SpoilGround, TransportRate, Vessel, WorkabilityResult } from "@/types/api";

export default function PortPage() {
  const [workTypes, setWorkTypes] = useState<PortWorkType[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [seaConditions, setSeaConditions] = useState<SeaCondition[]>([]);
  const [seaArea, setSeaArea] = useState("SEA_TOKYO_BAY");
  const [workForm, setWorkForm] = useState({ month: "8", wave_height: "", wind_speed: "" });
  const [workability, setWorkability] = useState<WorkabilityResult | null>(null);
  const [seaForm, setSeaForm] = useState({ sea_area_code: "SEA_TOKYO_BAY", sea_area_name: "東京湾", target_month: "1", workable_days: "20" });
  const [importVesselFile, setImportVesselFile] = useState<File | null>(null);
  const [soilTypes, setSoilTypes] = useState<SoilType[]>([]);
  const [transportRates, setTransportRates] = useState<TransportRate[]>([]);
  const [spoilGrounds, setSpoilGrounds] = useState<SpoilGround[]>([]);
  const [masterForm, setMasterForm] = useState({
    kind: "soil", code: "", name: "", factor: "1.0", distance: "10", price: "0", note: "",
  });
  const [shiftRules, setShiftRules] = useState<ShiftRule[]>([]);
  const [readiness, setReadiness] = useState<PortReadiness | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; issues: string[] } | null>(null);
  const [shiftForm, setShiftForm] = useState({
    rule_code: "", rule_name: "", shift_type: "night", time_from: "22:00", time_to: "05:00",
    labor_surcharge_rate: "0.25", machinery_surcharge_rate: "0.25", note: "",
  });
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
      const [w, v, s, soil, tr, sg, sh] = await Promise.all([
        api.portWorkTypes(), api.portVessels(), api.seaConditions(),
        api.soilTypes(), api.transportRates(), api.spoilGrounds(), api.shiftRules(),
      ]);
      setWorkTypes(w.work_types);
      setVessels(v.vessels);
      setSeaConditions(s.sea_conditions);
      setSoilTypes(soil.soil_types);
      setTransportRates(tr.transport_rates);
      setSpoilGrounds(sg.spoil_grounds);
      setShiftRules(sh.shift_rules);
      const rd = await api.portReadiness();
      setReadiness(rd.readiness);
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

  const saveMaster = async () => {
    setNotice(null);
    try {
      if (masterForm.kind === "soil") {
        await api.upsertSoilType({ soil_code: masterForm.code, soil_name: masterForm.name, dredging_correction_factor: Number(masterForm.factor), note: masterForm.note || null });
      } else if (masterForm.kind === "transport") {
        await api.upsertTransportRate({ distance_km: Number(masterForm.distance), transport_coefficient: Number(masterForm.factor), note: masterForm.note || null });
      } else {
        await api.upsertSpoilGround({ spoil_code: masterForm.code, spoil_name: masterForm.name, distance_km: masterForm.distance ? Number(masterForm.distance) : null, disposal_unit_price: Number(masterForm.price), note: masterForm.note || null });
      }
      setNotice("マスタを登録しました。");
      const [soil, tr, sg] = await Promise.all([api.soilTypes(), api.transportRates(), api.spoilGrounds()]);
      setSoilTypes(soil.soil_types);
      setTransportRates(tr.transport_rates);
      setSpoilGrounds(sg.spoil_grounds);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const saveShift = async () => {
    setNotice(null);
    try {
      await api.upsertShiftRule({
        rule_code: shiftForm.rule_code,
        rule_name: shiftForm.rule_name,
        shift_type: shiftForm.shift_type as "night" | "rotation" | "overtime",
        time_from: shiftForm.time_from || null,
        time_to: shiftForm.time_to || null,
        labor_surcharge_rate: Number(shiftForm.labor_surcharge_rate),
        machinery_surcharge_rate: Number(shiftForm.machinery_surcharge_rate),
        note: shiftForm.note || null,
      });
      setNotice("補正ルールを登録しました。");
      const sh = await api.shiftRules();
      setShiftRules(sh.shift_rules);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const runValidation = async () => {
    setNotice(null);
    try {
      const res = await fetch("/api/port-models/validate-coefficients");
      const body = (await res.json()) as { data: { validation: { ok: boolean; issues: string[] } } };
      setValidation(body.data.validation);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "照合検証に失敗しました");
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
          {readiness && (
            <div className={`rounded-lg border p-4 shadow-sm ${readiness.ready ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
              <h2 className="mb-2 text-base font-semibold">港湾積算の運用準備状況</h2>
              <div className="flex flex-wrap gap-2">
                {readiness.checklist.map((c) => (
                  <span key={c.key} className={`rounded px-2 py-1 text-xs ${c.ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                    {c.label}: {c.current}/{c.required}{c.ok ? " ✓" : " ✗"}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-600">{readiness.note}</div>
              <button onClick={() => void runValidation()} className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">係数データを照合検証</button>
              {validation && (
                <div className={`mt-2 rounded p-2 text-xs ${validation.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
                  {validation.ok ? "照合OK：問題はありません。" : `問題 ${validation.issues.length}件`}
                  {validation.issues.map((i, idx) => <div key={idx}>• {i}</div>)}
                </div>
              )}
            </div>
          )}
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
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">浚渫条件マスタ（土質・運搬距離・土捨場）</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <h3 className="mb-1 text-sm font-semibold">土質</h3>
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-1">土質</th><th>補正係数</th></tr></thead>
                  <tbody>
                    {soilTypes.map((s) => <tr key={s.id} className="border-b border-gray-100"><td className="py-1">{s.soil_name}</td><td className="py-1">×{s.dredging_correction_factor}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">運搬距離係数</h3>
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-1">距離</th><th>係数</th></tr></thead>
                  <tbody>
                    {transportRates.map((t) => <tr key={t.id} className="border-b border-gray-100"><td className="py-1">{t.distance_km}km以下</td><td className="py-1">×{t.transport_coefficient}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold">土捨場・処分場</h3>
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-1">名称</th><th>処分単価</th></tr></thead>
                  <tbody>
                    {spoilGrounds.map((s) => <tr key={s.id} className="border-b border-gray-100"><td className="py-1">{s.spoil_name}</td><td className="py-1">{s.disposal_unit_price}円/m3</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-7">
              <select className={inputCls} value={masterForm.kind} onChange={(e) => setMasterForm({ ...masterForm, kind: e.target.value })}>
                <option value="soil">土質</option>
                <option value="transport">運搬距離</option>
                <option value="spoil">土捨場</option>
              </select>
              <input className={inputCls} placeholder="コード*" value={masterForm.code} onChange={(e) => setMasterForm({ ...masterForm, code: e.target.value })} />
              <input className={inputCls} placeholder="名称*" value={masterForm.name} onChange={(e) => setMasterForm({ ...masterForm, name: e.target.value })} />
              <input className={inputCls} placeholder="係数/距離" value={masterForm.factor} onChange={(e) => setMasterForm({ ...masterForm, factor: e.target.value })} />
              <input className={inputCls} placeholder="距離(km)" value={masterForm.distance} onChange={(e) => setMasterForm({ ...masterForm, distance: e.target.value })} />
              <input className={inputCls} placeholder="処分単価" value={masterForm.price} onChange={(e) => setMasterForm({ ...masterForm, price: e.target.value })} />
              <button onClick={() => void saveMaster()} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">登録</button>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              土質: コード/名称/補正係数（factor）／運搬距離: 距離をfactorに入力／土捨場: コード/名称/処分単価（distanceは距離）
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">補正ルール（夜間施工・交代制・超勤）</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">ルール</th><th>種別</th><th>時間</th><th>労務割増</th><th>機械割増</th></tr></thead>
              <tbody>
                {shiftRules.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-1">{r.rule_name} <span className="text-xs text-gray-400">（{r.rule_code}）</span></td>
                    <td className="py-1 text-xs">{r.shift_type}</td>
                    <td className="py-1 text-xs">{r.time_from && r.time_to ? `${r.time_from}〜${r.time_to}` : "—"}</td>
                    <td className="py-1 text-right">+{(r.labor_surcharge_rate * 100).toFixed(0)}%</td>
                    <td className="py-1 text-right">+{(r.machinery_surcharge_rate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-7">
              <input className={inputCls} placeholder="コード*" value={shiftForm.rule_code} onChange={(e) => setShiftForm({ ...shiftForm, rule_code: e.target.value })} />
              <input className={inputCls} placeholder="名称*" value={shiftForm.rule_name} onChange={(e) => setShiftForm({ ...shiftForm, rule_name: e.target.value })} />
              <select className={inputCls} value={shiftForm.shift_type} onChange={(e) => setShiftForm({ ...shiftForm, shift_type: e.target.value })}>
                <option value="night">夜間</option>
                <option value="rotation">交代制</option>
                <option value="overtime">超勤</option>
              </select>
              <input className={inputCls} placeholder="開始（例: 22:00）" value={shiftForm.time_from} onChange={(e) => setShiftForm({ ...shiftForm, time_from: e.target.value })} />
              <input className={inputCls} placeholder="終了（例: 05:00）" value={shiftForm.time_to} onChange={(e) => setShiftForm({ ...shiftForm, time_to: e.target.value })} />
              <input className={inputCls} placeholder="労務割増（0.25）" value={shiftForm.labor_surcharge_rate} onChange={(e) => setShiftForm({ ...shiftForm, labor_surcharge_rate: e.target.value })} />
              <input className={inputCls} placeholder="機械割増（0.25）" value={shiftForm.machinery_surcharge_rate} onChange={(e) => setShiftForm({ ...shiftForm, machinery_surcharge_rate: e.target.value })} />
            </div>
            <button onClick={() => void saveShift()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">登録・更新</button>
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
