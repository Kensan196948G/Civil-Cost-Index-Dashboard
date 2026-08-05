"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs, formatNumber, formatDateTime } from "@/lib/utils";
import type { ChangeOrderDetail, ChangeOrderSummary, EstimationBase, ProjectSummary, WorkTypeTree } from "@/types/api";

export default function ChangeOrdersPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [bases, setBases] = useState<EstimationBase[]>([]);
  const [trees, setTrees] = useState<WorkTypeTree[]>([]);
  const [projectId, setProjectId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [orders, setOrders] = useState<ChangeOrderSummary[]>([]);
  const [detail, setDetail] = useState<ChangeOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [coForm, setCoForm] = useState({ name: "", change_date: "", reason: "" });
  const [lineForm, setLineForm] = useState({
    tree_id: "", tree_code: "", tree_name: "", unit: "",
    before_quantity: "", after_quantity: "", before_unit_price: "", after_unit_price: "", note: "",
  });

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

  const loadOrders = useCallback(async () => {
    if (!projectId) return;
    const res = await api.changeOrders(projectId);
    setOrders(res.change_orders);
  }, [projectId]);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
    void loadAll();
  }, [loadAll]);
  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const loadTrees = useCallback(async () => {
    if (!baseId) return;
    const res = await api.workTypeTrees(baseId);
    setTrees(res.trees);
  }, [baseId]);
  useEffect(() => { void loadTrees(); }, [loadTrees]);

  const create = async () => {
    setNotice(null);
    try {
      const res = await api.createChangeOrder({
        project_id: projectId,
        base_id: baseId || null,
        name: coForm.name,
        change_date: coForm.change_date || null,
        reason: coForm.reason || null,
      });
      setNotice("変更契約を作成しました。");
      setCoForm({ name: "", change_date: "", reason: "" });
      await loadOrders();
      await open(res.change_order_id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "作成に失敗しました");
    }
  };

  const open = async (id: string) => {
    try {
      const res = await api.changeOrder(id);
      setDetail(res.change_order);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取得に失敗しました");
    }
  };

  const addLine = async () => {
    setNotice(null);
    if (!detail) return;
    try {
      await api.addChangeOrderLine(detail.id, {
        tree_id: lineForm.tree_id || null,
        tree_code: lineForm.tree_code || (lineForm.tree_id ? trees.find((t) => t.id === lineForm.tree_id)?.code ?? null : null),
        tree_name: lineForm.tree_name || (lineForm.tree_id ? trees.find((t) => t.id === lineForm.tree_id)?.name ?? null : null),
        unit: lineForm.unit || null,
        before_quantity: Number(lineForm.before_quantity),
        after_quantity: Number(lineForm.after_quantity),
        before_unit_price: Number(lineForm.before_unit_price),
        after_unit_price: Number(lineForm.after_unit_price),
        note: lineForm.note || null,
      });
      setNotice("変更明細を追加しました。");
      setLineForm({ tree_id: "", tree_code: "", tree_name: "", unit: "", before_quantity: "", after_quantity: "", before_unit_price: "", after_unit_price: "", note: "" });
      await open(detail.id);
      await loadOrders();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "追加に失敗しました");
    }
  };

  const removeLine = async (lineId: string) => {
    if (!detail) return;
    try {
      await api.deleteChangeOrderLine(detail.id, lineId);
      await open(detail.id);
      await loadOrders();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const removeOrder = async (id: string) => {
    if (!window.confirm("この変更契約を削除しますか？")) return;
    try {
      await api.deleteChangeOrder(id);
      setDetail(null);
      await loadOrders();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";
  const money = (v: number) => formatNumber(v);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">設計変更・変更契約差額</h1>
      <p className="text-sm text-gray-600">
        変更前後の数量・単価・積算基準年度を保持し、増減額明細と差額表（Excel）を出力します。
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
          <label className={labelCls}>積算基準（変更前）</label>
          <select className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            {bases.map((b) => <option key={b.id} value={b.id}>{b.base_code} {b.base_name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>管理者キー</label>
          <input type="password" className={inputCls} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
        </div>
      </div>
      {loading && <LoadingState />}
      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">変更契約一覧</h2>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="名称*" value={coForm.name} onChange={(e) => setCoForm({ ...coForm, name: e.target.value })} />
              <input className={inputCls} type="date" value={coForm.change_date} onChange={(e) => setCoForm({ ...coForm, change_date: e.target.value })} />
              <input className={`${inputCls} col-span-2`} placeholder="変更理由" value={coForm.reason} onChange={(e) => setCoForm({ ...coForm, reason: e.target.value })} />
            </div>
            <button onClick={() => void create()} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">変更契約を作成</button>
            <div className="mt-3 space-y-1">
              {orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                  <button onClick={() => void open(o.id)} className="flex-1 text-left">
                    <div>{o.name} <span className="text-xs text-gray-400">（{o.base_code ?? "基準なし"}）</span></div>
                    <div className="text-xs text-gray-500">{formatDateTime(o.created_at)} / 差額 {money(o.net_diff)}円</div>
                  </button>
                  <button onClick={() => void removeOrder(o.id)} className="ml-2 text-xs text-red-600 hover:underline">削除</button>
                </div>
              ))}
              {orders.length === 0 && <div className="py-4 text-center text-sm text-gray-400">変更契約がありません</div>}
            </div>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {!detail && <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">変更契約を選択してください</div>}
            {detail && (
              <>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-base font-semibold">差額集計（{detail.name}）</h2>
                    <a href={api.changeOrderExportUrl(detail.id)} download={`cci-change-order-${detail.id.slice(0, 8)}.xlsx`} className="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                      差額表Excel出力
                    </a>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-gray-100"><td className="py-1">増額分</td><td className="py-1 text-right text-red-600">{money(detail.summary.increase)}</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-1">減額分</td><td className="py-1 text-right text-blue-600">{money(detail.summary.decrease)}</td></tr>
                      <tr className="font-bold"><td className="py-1">差額（増減合計）</td><td className="py-1 text-right">{money(detail.summary.net)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-2 text-base font-semibold">変更明細</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">工種</th><th>変更前</th><th>変更後</th><th>数量差</th><th>増減額</th><th></th></tr></thead>
                    <tbody>
                      {detail.lines.map((l) => (
                        <tr key={l.id} className="border-b border-gray-100">
                          <td className="py-1">{l.tree_code} {l.tree_name}<div className="text-xs text-gray-400">{l.unit}</div></td>
                          <td className="py-1 text-right text-xs">{formatNumber(l.before_quantity)} @ {money(l.before_unit_price)}</td>
                          <td className="py-1 text-right text-xs">{formatNumber(l.after_quantity)} @ {money(l.after_unit_price)}</td>
                          <td className="py-1 text-right">{formatNumber(l.quantity_diff)}</td>
                          <td className={`py-1 text-right ${l.amount_diff > 0 ? "text-red-600" : l.amount_diff < 0 ? "text-blue-600" : ""}`}>{money(l.amount_diff)}</td>
                          <td className="py-1"><button onClick={() => void removeLine(l.id)} className="text-xs text-red-600 hover:underline">削除</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h3 className="mb-2 mt-3 text-sm font-semibold">変更明細を追加</h3>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <select className={inputCls} value={lineForm.tree_id} onChange={(e) => setLineForm({ ...lineForm, tree_id: e.target.value })}>
                      <option value="">工種（任意）</option>
                      {trees.map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}
                    </select>
                    <input className={inputCls} placeholder="単位" value={lineForm.unit} onChange={(e) => setLineForm({ ...lineForm, unit: e.target.value })} />
                    <input className={inputCls} type="number" placeholder="変更前数量*" value={lineForm.before_quantity} onChange={(e) => setLineForm({ ...lineForm, before_quantity: e.target.value })} />
                    <input className={inputCls} type="number" placeholder="変更後数量*" value={lineForm.after_quantity} onChange={(e) => setLineForm({ ...lineForm, after_quantity: e.target.value })} />
                    <input className={inputCls} type="number" placeholder="変更前単価*" value={lineForm.before_unit_price} onChange={(e) => setLineForm({ ...lineForm, before_unit_price: e.target.value })} />
                    <input className={inputCls} type="number" placeholder="変更後単価*" value={lineForm.after_unit_price} onChange={(e) => setLineForm({ ...lineForm, after_unit_price: e.target.value })} />
                    <input className={`${inputCls} col-span-2`} placeholder="備考" value={lineForm.note} onChange={(e) => setLineForm({ ...lineForm, note: e.target.value })} />
                  </div>
                  <button onClick={() => void addLine()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">明細を追加</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
