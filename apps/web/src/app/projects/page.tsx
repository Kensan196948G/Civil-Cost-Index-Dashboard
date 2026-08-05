"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { Item, Project, ProjectSummary, Region, SimulationResult } from "@/types/api";

const STATUS_LABEL: Record<string, string> = {
  planning: "計画", bidding: "入札前", contracted: "契約済", executing: "施工中", completed: "完了",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newProject, setNewProject] = useState({ name: "", client_name: "", work_type: "", region_id: "" });
  const [itemForm, setItemForm] = useState({
    item_id: "", region_id: "", quantity: "", base_unit_price: "", procurement_month: "", note: "",
  });
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [simIndex, setSimIndex] = useState("");
  const [simBase, setSimBase] = useState("2025-01");
  const [simulating, setSimulating] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, i, r] = await Promise.all([api.projects(), api.items(), api.regions()]);
      setProjects(p.projects);
      setItems(i.items);
      setRegions(r.regions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const openProject = async (id: string) => {
    try {
      const res = await api.project(id);
      setSelected(res.project);
      setSim(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取得に失敗しました");
    }
  };

  const create = async () => {
    setNotice(null);
    try {
      await api.createProject({
        name: newProject.name,
        client_name: newProject.client_name || undefined,
        work_type: newProject.work_type || undefined,
        region_id: newProject.region_id || undefined,
      });
      setNotice("案件を登録しました。");
      setNewProject({ name: "", client_name: "", work_type: "", region_id: "" });
      await loadAll();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const addItem = async () => {
    setNotice(null);
    if (!selected) return;
    try {
      await api.addProjectItem(selected.id, {
        item_id: itemForm.item_id,
        region_id: itemForm.region_id || undefined,
        quantity: Number(itemForm.quantity),
        base_unit_price: Number(itemForm.base_unit_price),
        procurement_month: itemForm.procurement_month || undefined,
        note: itemForm.note || undefined,
      });
      setItemForm({ item_id: "", region_id: "", quantity: "", base_unit_price: "", procurement_month: "", note: "" });
      await openProject(selected.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "明細追加に失敗しました");
    }
  };

  const removeItem = async (itemId: string) => {
    if (!selected) return;
    try {
      await api.deleteProjectItem(selected.id, itemId);
      await openProject(selected.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const deleteProject = async (id: string) => {
    if (!window.confirm("この案件を削除しますか？")) return;
    try {
      await api.deleteProject(id);
      setSelected(null);
      await loadAll();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const simulate = async () => {
    if (!selected) return;
    setSimulating(true);
    setNotice(null);
    try {
      const res = await api.simulateProject(selected.id, {
        scenarios: [
          { name: "下振れ", delta: -0.1 },
          { name: "標準", delta: 0 },
          { name: "上振れ", delta: 0.1 },
        ],
        index_item_id: simIndex || null,
        base_period: simBase || null,
      });
      setSim(res.simulation);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "シミュレーションに失敗しました");
    } finally {
      setSimulating(false);
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">案件別価格影響分析</h1>
        <button onClick={() => void deleteProject(selected?.id ?? "")} className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50" disabled={!selected}>
          選択案件を削除
        </button>
      </div>
      <p className="text-sm text-gray-600">
        案件に数量・基準単価・調達予定月を登録し、価格影響額 = 数量 × 基準単価 × 変動率 を資材別・月別に試算します。
        指数を指定すると実データの変動率を加味できます（AIによる確定値ではなく、参考シナリオです）。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void loadAll()} />}
      {loading && <LoadingState />}
      {!loading && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">案件一覧</h2>
              <div className="mb-3 space-y-1">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void openProject(p.id)}
                    className={`flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm hover:bg-gray-50 ${selected?.id === p.id ? "border-blue-400 bg-blue-50" : "border-gray-200"}`}
                  >
                    <span>
                      {p.name}
                      <span className="ml-2 text-xs text-gray-400">{STATUS_LABEL[p.status] ?? p.status}</span>
                    </span>
                    <span className="text-xs text-gray-500">{p.item_count}明細 / {formatNumber(p.base_total)}円</span>
                  </button>
                ))}
              </div>
              <h3 className="mb-2 text-sm font-semibold">新規案件</h3>
              <div className="space-y-2">
                <input className={inputCls} placeholder="案件名*" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} />
                <input className={inputCls} placeholder="発注者" value={newProject.client_name} onChange={(e) => setNewProject({ ...newProject, client_name: e.target.value })} />
                <input className={inputCls} placeholder="工種（例: 浚渫 / 護岸 / 岸壁）" value={newProject.work_type} onChange={(e) => setNewProject({ ...newProject, work_type: e.target.value })} />
                <select className={inputCls} value={newProject.region_id} onChange={(e) => setNewProject({ ...newProject, region_id: e.target.value })}>
                  <option value="">地域（任意）</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.region_name}</option>)}
                </select>
                <button onClick={() => void create()} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">案件を登録</button>
              </div>
            </div>
            <div className="space-y-4 lg:col-span-2">
              {!selected && <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">左の案件を選択してください</div>}
              {selected && (
                <>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <h2 className="mb-2 text-base font-semibold">{selected.name} の内訳</h2>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                          <th className="py-2">品目</th><th>地域</th><th>数量</th><th>基準単価</th><th>小計</th><th>調達月</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.items.map((it) => (
                          <tr key={it.id} className="border-b border-gray-100">
                            <td className="py-2">{it.item_name}{it.estimate_usable === false && <span className="ml-1 rounded bg-rose-100 px-1 py-0.5 text-[10px] text-rose-700">参考のみ</span>}</td>
                            <td className="py-2 text-xs">{it.region_name ?? "全国"}</td>
                            <td className="py-2 text-right">{formatNumber(it.quantity)}</td>
                            <td className="py-2 text-right">{formatNumber(it.base_unit_price)}</td>
                            <td className="py-2 text-right">{formatNumber(it.quantity * it.base_unit_price)}</td>
                            <td className="py-2 text-xs">{it.procurement_month ?? "未定"}</td>
                            <td className="py-2"><button onClick={() => void removeItem(it.id)} className="text-xs text-red-600 hover:underline">削除</button></td>
                          </tr>
                        ))}
                        {selected.items.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-400">明細がありません</td></tr>}
                      </tbody>
                    </table>
                    <h3 className="mb-2 mt-3 text-sm font-semibold">明細を追加</h3>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <select className={inputCls} value={itemForm.item_id} onChange={(e) => setItemForm({ ...itemForm, item_id: e.target.value })}>
                        <option value="">品目*</option>
                        {items.map((i) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
                      </select>
                      <select className={inputCls} value={itemForm.region_id} onChange={(e) => setItemForm({ ...itemForm, region_id: e.target.value })}>
                        <option value="">地域</option>
                        {regions.map((r) => <option key={r.id} value={r.id}>{r.region_name}</option>)}
                      </select>
                      <input className={inputCls} type="number" placeholder="数量*" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
                      <input className={inputCls} type="number" placeholder="基準単価*" value={itemForm.base_unit_price} onChange={(e) => setItemForm({ ...itemForm, base_unit_price: e.target.value })} />
                      <input className={inputCls} placeholder="調達予定月 YYYY-MM" value={itemForm.procurement_month} onChange={(e) => setItemForm({ ...itemForm, procurement_month: e.target.value })} />
                      <input className={inputCls} placeholder="注記" value={itemForm.note} onChange={(e) => setItemForm({ ...itemForm, note: e.target.value })} />
                      <button onClick={() => void addItem()} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">追加</button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <h2 className="mb-2 text-base font-semibold">価格影響シミュレーション</h2>
                    <div className="grid gap-2 md:grid-cols-3">
                      <select className={inputCls} value={simIndex} onChange={(e) => setSimIndex(e.target.value)}>
                        <option value="">指数を使わない（シナリオ係数のみ）</option>
                        {items.filter((i) => i.category === "PRICE_INDEX").map((i) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
                      </select>
                      <input className={inputCls} value={simBase} onChange={(e) => setSimBase(e.target.value)} placeholder="基準年月 YYYY-MM" />
                      <button onClick={() => void simulate()} disabled={simulating} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
                        {simulating ? "計算中…" : "下振れ/標準/上振れ で試算"}
                      </button>
                    </div>
                    {sim && (
                      <div className="mt-4 space-y-4">
                        {sim.warnings.length > 0 && (
                          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">{sim.warnings.join(" ")}</div>
                        )}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                              <th className="py-2">シナリオ</th><th>基準額</th><th>影響額</th><th>試算額</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sim.scenarios.map((sc) => (
                              <tr key={sc.name} className="border-b border-gray-100">
                                <td className="py-2 font-medium">{sc.name}</td>
                                <td className="py-2 text-right">{formatNumber(sc.total_base)}</td>
                                <td className={`py-2 text-right ${sc.total_impact > 0 ? "text-red-600" : sc.total_impact < 0 ? "text-blue-600" : "text-gray-500"}`}>
                                  {sc.total_impact >= 0 ? "+" : ""}{formatNumber(sc.total_impact)}
                                </td>
                                <td className="py-2 text-right">{formatNumber(sc.total_projected)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <h3 className="text-sm font-semibold">明細別（標準シナリオ）</h3>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-500">
                              <th className="py-1">品目</th><th>基準単価</th><th>実変動率</th><th>適用率</th><th>影響額</th><th>試算単価</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(sim.scenarios.find((s) => s.name === "標準")?.items ?? []).map((it) => (
                              <tr key={it.item_id} className="border-b border-gray-100">
                                <td className="py-1">{it.item_name}</td>
                                <td className="py-1 text-right">{formatNumber(it.base_unit_price)}</td>
                                <td className="py-1 text-right">{it.actual_rate != null ? `${(it.actual_rate * 100).toFixed(1)}%` : "—"}</td>
                                <td className="py-1 text-right">{(it.effective_rate * 100).toFixed(1)}%</td>
                                <td className="py-1 text-right">{formatNumber(it.impact_amount)}</td>
                                <td className="py-1 text-right">{formatNumber(it.projected_unit_price)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <h3 className="text-sm font-semibold">月別影響額</h3>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-500">
                              <th className="py-1">調達月</th>
                              {sim.scenarios.map((sc) => <th key={sc.name} className="py-1">{sc.name}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {sim.monthly.map((m) => (
                              <tr key={m.period} className="border-b border-gray-100">
                                <td className="py-1">{m.period}</td>
                                {sim.scenarios.map((sc) => <td key={sc.name} className="py-1 text-right">{formatNumber(m.impacts[sc.name] ?? 0)}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
