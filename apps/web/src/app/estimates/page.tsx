"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatNumber, formatDateTime, downloadFile } from "@/lib/utils";
import type { BreakdownSuggestion, EstimationBase, EstimateDetail, EstimateSummary, ProjectSummary, SeaCondition, ShiftRule, SoilType, SpoilGround } from "@/types/api";

export default function EstimatesPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [bases, setBases] = useState<EstimationBase[]>([]);
  const [projectId, setProjectId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [name, setName] = useState("");
  const [portForm, setPortForm] = useState({
    operation_rate: "0.7",
    mobilization_days: "",
    soil_correction: "0",
    night_surcharge: "0",
    soil_type_code: "",
    spoil_ground_code: "",
    transport_distance_km: "",
    shift_rules: [] as string[],
  });
  const [seaOptions, setSeaOptions] = useState<SeaCondition[]>([]);
  const [seaArea, setSeaArea] = useState("");
  const [seaMonth, setSeaMonth] = useState("8");
  const [seaNote, setSeaNote] = useState("");
  const [soilOptions, setSoilOptions] = useState<SoilType[]>([]);
  const [spoilOptions, setSpoilOptions] = useState<SpoilGround[]>([]);
  const [shiftOptions, setShiftOptions] = useState<ShiftRule[]>([]);
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [detail, setDetail] = useState<EstimateDetail | null>(null);
  const [suggestion, setSuggestion] = useState<BreakdownSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, b] = await Promise.all([api.projects(), api.estimationBases()]);
      setProjects(p.projects);
      setBases(b.estimation_bases);
      if (!projectId && p.projects[0]) setProjectId(p.projects[0].id);
      if (!baseId && b.estimation_bases[0]) setBaseId(b.estimation_bases[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [projectId, baseId]);

  const loadEstimates = useCallback(async () => {
    if (!projectId) return;
    const res = await api.estimates(projectId);
    setEstimates(res.estimates);
  }, [projectId]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { void loadEstimates(); }, [loadEstimates]);

  useEffect(() => {
    if (selectedBase?.category !== "port") return;
    void Promise.all([api.seaConditions(), api.soilTypes(), api.spoilGrounds(), api.shiftRules()])
      .then(([s, soil, spoil, shift]) => {
        setSeaOptions(s.sea_conditions);
        setSoilOptions(soil.soil_types);
        setSpoilOptions(spoil.spoil_grounds);
        setShiftOptions(shift.shift_rules);
        const first = s.sea_conditions[0];
        if (first) {
          setSeaArea(first.sea_area_code);
          void applyWorkability(first.sea_area_code, Number(seaMonth));
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId]);

  const applyWorkability = async (area: string, month: number) => {
    try {
      const res = await api.computeWorkability({ sea_area_code: area, target_month: month });
      setPortForm((p) => ({ ...p, operation_rate: String(res.workability.operation_rate) }));
      setSeaNote(`${res.workability.sea_area_name} ${month}月: 施工可能 ${res.workability.workable_days}日 / ${res.workability.calendar_days}日 → 稼働率 ${res.workability.operation_rate}`);
    } catch (e) {
      setSeaNote(e instanceof Error ? e.message : "海象条件の取得に失敗しました");
    }
  };

  const calculate = async () => {
    setCalculating(true);
    setNotice(null);
    setSuggestion(null);
    try {
      const selectedBase = bases.find((b) => b.id === baseId);
      const isPort = selectedBase?.category === "port";
      const res = await api.calculateEstimate({
        project_id: projectId,
        base_id: baseId,
        name: name || "積算",
        ...(isPort
          ? {
              port_options: {
                operation_rate: Number(portForm.operation_rate),
                mobilization_days: portForm.mobilization_days ? Number(portForm.mobilization_days) : null,
                soil_correction: Number(portForm.soil_correction),
                night_surcharge: Number(portForm.night_surcharge),
                soil_type_code: portForm.soil_type_code || null,
                spoil_ground_code: portForm.spoil_ground_code || null,
                transport_distance_km: portForm.transport_distance_km ? Number(portForm.transport_distance_km) : null,
                shift_rules: portForm.shift_rules,
              },
            }
          : {}),
      });
      setDetail(res.estimate);
      setNotice("積算を計算しました（計算はコードで実行、AIは金額に関与していません）。");
      await loadEstimates();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "計算に失敗しました");
    } finally {
      setCalculating(false);
    }
  };

  const open = async (id: string) => {
    try {
      const res = await api.estimate(id);
      setDetail(res.estimate);
      setSuggestion(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取得に失敗しました");
    }
  };

  const suggest = async () => {
    setNotice(null);
    try {
      const res = await api.aiBreakdownSuggest({ project_id: projectId, base_id: baseId });
      setSuggestion(res.suggestion);
      setNotice(`AI歩掛候補を生成しました（生成元: ${res.suggestion.provider}${res.suggestion.model ? ` / ${res.suggestion.model}` : ""}）。承認前の参考情報です。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "AI候補の生成に失敗しました");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("この積算結果を削除しますか？")) return;
    try {
      await api.deleteEstimate(id);
      setDetail(null);
      await loadEstimates();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const submit = async (id: string) => {
    if (!window.confirm("この積算を確認依頼（承認待ち）へ提出しますか？")) return;
    try {
      await api.submitEstimate(id);
      setNotice("積算を確認依頼へ提出しました。");
      await loadEstimates();
      await open(id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "提出に失敗しました");
    }
  };

  const approve = async (id: string) => {
    if (!window.confirm("この積算を承認して確定しますか？承認後の編集・削除はできません。")) return;
    try {
      await api.approveEstimate(id);
      setNotice("積算を承認・確定しました。");
      await loadEstimates();
      await open(id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "承認に失敗しました");
    }
  };

  const reject = async (id: string) => {
    if (!window.confirm("確認依頼を差し戻し、下書きに戻しますか？")) return;
    try {
      await api.rejectEstimate(id);
      setNotice("確認依頼を差し戻しました。");
      await loadEstimates();
      await open(id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "差し戻しに失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";
  const money = (v: number) => formatNumber(v);
  const statusLabel = (s: string) =>
    ({ draft: "下書き", review: "確認依頼中", approved: "承認済み", confirmed: "確定（旧）", superseded: "失効" })[s] ?? s;
  const statusCls = (s: string) =>
    s === "approved" || s === "confirmed"
      ? "bg-green-100 text-green-700"
      : s === "review"
        ? "bg-blue-100 text-blue-700"
        : s === "superseded"
          ? "bg-gray-100 text-gray-500"
          : "bg-amber-100 text-amber-700";
  const selectedBase = bases.find((b) => b.id === baseId);
  const isPort = selectedBase?.category === "port";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">積算計算</h1>
      <p className="text-sm text-gray-600">
        数量×歩掛×単価で直接工事費を計算し、共通仮設費・現場管理費・一般管理費等・消費税まで
        積算基準の端数規則に従って算出します。すべてコードで計算され、AIは歩掛選定などの候補提示のみ担当します。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void loadAll()} />}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>案件</label>
          <select className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>積算基準</label>
          <select className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            {bases.map((b) => <option key={b.id} value={b.id}>{b.base_code} {b.base_name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>積算名称</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 本工事積算" />
        </div>
        {isPort && (
          <div className="flex flex-wrap items-end gap-3 rounded border border-blue-200 bg-blue-50 p-3">
            <div>
              <label className={labelCls}>海域</label>
              <select className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={seaArea} onChange={(e) => { setSeaArea(e.target.value); void applyWorkability(e.target.value, Number(seaMonth)); }}>
                {[...new Set(seaOptions.map((s) => s.sea_area_code))].map((code) => (
                  <option key={code} value={code}>{seaOptions.find((s) => s.sea_area_code === code)?.sea_area_name ?? code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>施工予定月</label>
              <select className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={seaMonth} onChange={(e) => { setSeaMonth(e.target.value); void applyWorkability(seaArea, Number(e.target.value)); }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={String(m)}>{m}月</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>稼働率</label>
              <input className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm" type="number" min={0.1} max={1} step={0.05} value={portForm.operation_rate} onChange={(e) => setPortForm({ ...portForm, operation_rate: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>回航日数（空欄=マスタ値）</label>
              <input className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm" type="number" min={0} max={60} value={portForm.mobilization_days} onChange={(e) => setPortForm({ ...portForm, mobilization_days: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>土質補正（%）</label>
              <input className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm" type="number" step={1} value={portForm.soil_correction} onChange={(e) => setPortForm({ ...portForm, soil_correction: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>夜間・交代制補正（%）</label>
              <input className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm" type="number" step={1} value={portForm.night_surcharge} onChange={(e) => setPortForm({ ...portForm, night_surcharge: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>土質</label>
              <select className="w-36 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={portForm.soil_type_code} onChange={(e) => setPortForm({ ...portForm, soil_type_code: e.target.value })}>
                <option value="">指定なし</option>
                {soilOptions.map((s) => <option key={s.id} value={s.soil_code}>{s.soil_name}（×{s.dredging_correction_factor}）</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>土捨場・処分場</label>
              <select className="w-44 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={portForm.spoil_ground_code} onChange={(e) => setPortForm({ ...portForm, spoil_ground_code: e.target.value })}>
                <option value="">指定なし</option>
                {spoilOptions.map((s) => <option key={s.id} value={s.spoil_code}>{s.spoil_name}（{s.disposal_unit_price}円/m3）</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>運搬距離（km）</label>
              <input className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm" type="number" min={0} value={portForm.transport_distance_km} onChange={(e) => setPortForm({ ...portForm, transport_distance_km: e.target.value })} />
            </div>
            <div className="w-full">
              <label className={labelCls}>補正ルール（夜間/交代制/超勤）</label>
              <div className="flex flex-wrap gap-2 pt-1">
                {shiftOptions.map((r) => (
                  <label key={r.id} className="flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-xs text-blue-800">
                    <input
                      type="checkbox"
                      checked={portForm.shift_rules.includes(r.rule_code)}
                      onChange={(e) => setPortForm({
                        ...portForm,
                        shift_rules: e.target.checked
                          ? [...portForm.shift_rules, r.rule_code]
                          : portForm.shift_rules.filter((c) => c !== r.rule_code),
                      })}
                    />
                    {r.rule_name}（労務+{(r.labor_surcharge_rate * 100).toFixed(0)}% / 機械+{(r.machinery_surcharge_rate * 100).toFixed(0)}%）
                  </label>
                ))}
              </div>
            </div>
            <span className="text-xs text-blue-700">港湾: 船舶損料・供用係数・回航費・拘束費を自動算定</span>
            {seaNote && <div className="w-full text-xs text-blue-700">{seaNote}</div>}
          </div>
        )}
        <button onClick={() => void calculate()} disabled={calculating || !projectId || !baseId} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {calculating ? "計算中…" : "積算を計算"}
        </button>
      </div>
      {loading && <LoadingState />}
      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">積算結果一覧</h2>
            <div className="space-y-1">
              {estimates.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                  <button onClick={() => void open(e.id)} className="flex-1 text-left">
                    <div>{e.name} <span className="text-xs text-gray-400">（{e.base_code}）</span>
                      <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${statusCls(e.status)}`}>{statusLabel(e.status)}</span>
                    </div>
                    <div className="text-xs text-gray-500">{formatDateTime(e.created_at)} / 合計 {money(e.total)}円</div>
                  </button>
                  {e.status === "draft" && <button onClick={() => void remove(e.id)} className="ml-2 text-xs text-red-600 hover:underline">削除</button>}
                </div>
              ))}
              {estimates.length === 0 && <div className="py-4 text-center text-sm text-gray-400">まだ積算結果がありません</div>}
            </div>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {!detail && <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">積算を計算するか、一覧から結果を選択してください</div>}
            {detail && (
              <>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold">総括表（{detail.name} / {detail.base_code}）</h2>
                      <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${statusCls(detail.status)}`}>{statusLabel(detail.status)}</span>
                    </div>
                    <div className="flex gap-2">
                      {detail.status === "draft" && (
                        <button onClick={() => void submit(detail.id)} className="rounded border border-blue-400 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50">
                          確認依頼へ提出
                        </button>
                      )}
                      {detail.status === "review" && (
                        <>
                          <button onClick={() => void approve(detail.id)} className="rounded border border-green-500 px-2 py-1 text-xs text-green-700 hover:bg-green-50">
                            承認・確定
                          </button>
                          <button onClick={() => void reject(detail.id)} className="rounded border border-amber-400 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50">
                            差し戻し
                          </button>
                        </>
                      )}
                      <button onClick={() => void downloadFile(api.estimateExportUrl(detail.id), `cci-estimate-${detail.id.slice(0, 8)}.xlsx`, "積算書Excel")} className="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        積算書Excel出力
                      </button>
                      <button onClick={() => void downloadFile(api.estimatePdfExportUrl(detail.id), `cci-estimate-${detail.id.slice(0, 8)}.pdf`, "積算書PDF")} className="rounded border border-rose-400 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">
                        積算書PDF出力
                      </button>
                      <button onClick={() => void suggest()} className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50">AI歩掛候補</button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-gray-100"><td className="py-1">直接工事費</td><td className="py-1 text-right">{money(detail.direct_cost)}</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-1">共通仮設費</td><td className="py-1 text-right">{money(detail.common_temp_cost)}</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-1">現場管理費</td><td className="py-1 text-right">{money(detail.site_management_cost)}</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-1">一般管理費等</td><td className="py-1 text-right">{money(detail.general_management_cost)}</td></tr>
                      <tr className="border-b border-gray-100 font-semibold"><td className="py-1">小計（税抜）</td><td className="py-1 text-right">{money(detail.subtotal)}</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-1">消費税（10%）</td><td className="py-1 text-right">{money(detail.tax_amount)}</td></tr>
                      <tr className="font-bold"><td className="py-1">合計</td><td className="py-1 text-right text-blue-700">{money(detail.total)}</td></tr>
                    </tbody>
                  </table>
                  {detail.warnings.length > 0 && (
                    <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">{detail.warnings.join(" ")}</div>
                  )}
                  {detail.port_options && (
                    <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm">
                      <div className="mb-1 font-semibold text-blue-900">港湾補足（作業船・海象条件）</div>
                      <div className="grid grid-cols-2 gap-1 text-xs text-blue-800 md:grid-cols-4">
                        <div>稼働率: {detail.port_options.operation_rate}</div>
                        <div>回航日数: {detail.port_options.mobilization_days ?? "マスタ値"}</div>
                        <div>土質補正: {detail.port_options.soil_correction}</div>
                        <div>夜間補正: {detail.port_options.night_surcharge}</div>
                        <div>土質係数: {detail.port_options.soil_factor ?? 1}</div>
                        <div>運搬係数: {detail.port_options.transport_coefficient ?? 1}</div>
                        <div>稼働日数: {detail.port_extras?.work_days ?? 0}日</div>
                        <div>待機・拘束: {detail.port_extras?.standby_days ?? 0}日</div>
                        <div>処分費: {money(detail.port_extras?.disposal_cost ?? 0)}円</div>
                        <div>労務補正: +{((detail.port_extras?.shift_labor_surcharge ?? 0) * 100).toFixed(0)}%</div>
                        <div>機械補正: +{((detail.port_extras?.shift_machinery_surcharge ?? 0) * 100).toFixed(0)}%</div>
                        <div className="col-span-2">回航・えい航費: {money(detail.port_extras?.mobilization_cost ?? 0)}円</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-2 text-base font-semibold">内訳</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">工種</th><th>数量</th><th>労務費</th><th>材料費</th><th>機械費</th><th>直接費</th></tr></thead>
                    <tbody>
                      {detail.lines.map((l) => (
                        <tr key={l.id} className="border-b border-gray-100">
                          <td className="py-1">{l.tree_code} {l.tree_name}{l.note ? <span className="ml-1 text-xs text-amber-600">（{l.note}）</span> : ""}</td>
                          <td className="py-1 text-right">{formatNumber(l.quantity)} {l.unit ?? ""}</td>
                          <td className="py-1 text-right">{money(l.labor_cost)}</td>
                          <td className="py-1 text-right">{money(l.material_cost)}</td>
                          <td className="py-1 text-right">{money(l.machinery_cost)}</td>
                          <td className="py-1 text-right font-semibold">{money(l.direct_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-2 text-base font-semibold">単価表（労務・材料・機械）</h2>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left text-gray-600"><th className="py-1">内訳</th><th>区分</th><th>資源</th><th>数量</th><th>単価</th><th>金額</th></tr></thead>
                    <tbody>
                      {detail.materials.map((m) => (
                        <tr key={m.id} className="border-b border-gray-100">
                          <td className="py-1">{detail.lines.find((l) => l.id === m.line_id)?.tree_name ?? m.line_id ?? ""}</td>
                          <td className="py-1">{m.resource_type}</td>
                          <td className="py-1">{m.resource_name}</td>
                          <td className="py-1 text-right">{formatNumber(m.quantity)} {m.unit ?? ""}</td>
                          <td className="py-1 text-right">{money(m.unit_price)}</td>
                          <td className="py-1 text-right">{money(m.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {suggestion && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <h2 className="mb-1 text-base font-semibold text-blue-900">AI歩掛候補（要確認・承認）</h2>
                    <div className="mb-2 text-xs text-blue-700">生成元: {suggestion.provider}{suggestion.model ? ` / ${suggestion.model}` : ""} — 金額は計算されていません</div>
                    <table className="w-full text-xs">
                      <thead><tr className="border-b text-left text-blue-900"><th className="py-1">数量</th><th>候補歩掛</th><th>スコア</th><th>理由</th></tr></thead>
                      <tbody>
                        {suggestion.suggestions.map((s, i) => (
                          <tr key={i} className="border-b border-blue-100">
                            <td className="py-1">{s.tree_code} {s.tree_name}</td>
                            <td className="py-1 font-mono">{s.breakdown_id || "（なし）"}</td>
                            <td className="py-1">{(s.score * 100).toFixed(0)}%</td>
                            <td className="py-1">{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
