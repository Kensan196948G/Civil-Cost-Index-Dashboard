"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs, formatDateTime } from "@/lib/utils";
import type { EstimationBase, WorkBreakdown, WorkTypeTree } from "@/types/api";

export default function BreakdownsPage() {
  const [bases, setBases] = useState<EstimationBase[]>([]);
  const [baseId, setBaseId] = useState("");
  const [trees, setTrees] = useState<WorkTypeTree[]>([]);
  const [breakdowns, setBreakdowns] = useState<WorkBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [treeForm, setTreeForm] = useState({ code: "", name: "", level: "3", unit: "" });
  const [bdForm, setBdForm] = useState({
    tree_id: "", condition_json: "{}", labor: "[]", material: "[]", machinery: "[]", note: "",
  });
  const [importFile, setImportFile] = useState<File | null>(null);

  const loadBases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.estimationBases();
      setBases(res.estimation_bases);
      if (!baseId && res.estimation_bases[0]) setBaseId(res.estimation_bases[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [baseId]);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
    void loadBases();
  }, [loadBases]);

  const loadData = useCallback(async () => {
    if (!baseId) return;
    setLoading(true);
    try {
      const [t, b] = await Promise.all([api.workTypeTrees(baseId), api.workBreakdowns({ base_id: baseId })]);
      setTrees(t.trees);
      setBreakdowns(b.breakdowns);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [baseId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const createTree = async () => {
    setNotice(null);
    try {
      await api.createWorkTypeTree({ base_id: baseId, code: treeForm.code, name: treeForm.name, level: Number(treeForm.level), unit: treeForm.unit || undefined });
      setNotice("工種体系を登録しました。");
      await loadData();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const createBreakdown = async () => {
    setNotice(null);
    try {
      await api.createWorkBreakdown({
        base_id: baseId,
        tree_id: bdForm.tree_id,
        condition_json: JSON.parse(bdForm.condition_json || "{}"),
        labor: JSON.parse(bdForm.labor || "[]"),
        material: JSON.parse(bdForm.material || "[]"),
        machinery: JSON.parse(bdForm.machinery || "[]"),
        note: bdForm.note || null,
        source_type: "book_entry",
      });
      setNotice("歩掛を登録しました。");
      await loadData();
    } catch (e) {
      setNotice(e instanceof Error ? `登録に失敗しました: ${e.message}` : "登録に失敗しました（JSON構文を確認）");
    }
  };

  const doImport = async () => {
    setNotice(null);
    if (!importFile) return;
    try {
      const res = await api.importWorkBreakdowns(importFile, baseId);
      setNotice(`取込完了: ${res.result.imported}件 ／ エラー ${res.result.errors.length}件`);
      await loadData();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取込に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">工種体系・歩掛マスタ</h1>
      <p className="text-sm text-gray-600">
        工種/細別の体系と、数量に対する労務・材料・機械の歩掛（JSON）を管理します。
        CSV/Excel取込の列: tree_code, condition_json, resource_type(labor/material/machinery), resource_name, resource_unit, quantity_per_unit, unit_price
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void loadData()} />}
      <div className="flex items-center gap-3">
        <label className={labelCls}>基準</label>
        <select className="w-72 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
          {bases.map((b) => <option key={b.id} value={b.id}>{b.base_code} {b.base_name}</option>)}
        </select>
        <input type="password" className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="X-Admin-Key" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
      </div>
      {loading && <LoadingState />}
      {!loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">工種体系</h2>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="コード*" value={treeForm.code} onChange={(e) => setTreeForm({ ...treeForm, code: e.target.value })} />
              <input className={inputCls} placeholder="名称*" value={treeForm.name} onChange={(e) => setTreeForm({ ...treeForm, name: e.target.value })} />
              <input className={inputCls} type="number" min={1} max={4} placeholder="レベル（1=工種〜4=規格）" value={treeForm.level} onChange={(e) => setTreeForm({ ...treeForm, level: e.target.value })} />
              <input className={inputCls} placeholder="単位（任意）" value={treeForm.unit} onChange={(e) => setTreeForm({ ...treeForm, unit: e.target.value })} />
            </div>
            <button onClick={() => void createTree()} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">工種を登録</button>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">コード</th><th>名称</th><th>Lv</th><th>単位</th></tr></thead>
              <tbody>
                {trees.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-1 font-mono text-xs">{t.code}</td><td>{t.name}</td><td className="text-xs">{t.level}</td><td className="text-xs">{t.unit ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">歩掛登録</h2>
            <div className="grid grid-cols-2 gap-2">
              <select className={inputCls} value={bdForm.tree_id} onChange={(e) => setBdForm({ ...bdForm, tree_id: e.target.value })}>
                <option value="">工種/細別*</option>
                {trees.map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}
              </select>
              <input className={inputCls} placeholder={'condition_json（例: {"soil":"clay"}）'} value={bdForm.condition_json} onChange={(e) => setBdForm({ ...bdForm, condition_json: e.target.value })} />
              <textarea className={`${inputCls} col-span-2`} rows={2} placeholder='労務 JSON（例: [{"name":"普通作業員","unit":"人日","quantity":0.02,"unit_price":22000}]）' value={bdForm.labor} onChange={(e) => setBdForm({ ...bdForm, labor: e.target.value })} />
              <textarea className={`${inputCls} col-span-2`} rows={2} placeholder='材料 JSON（例: []）' value={bdForm.material} onChange={(e) => setBdForm({ ...bdForm, material: e.target.value })} />
              <textarea className={`${inputCls} col-span-2`} rows={2} placeholder='機械 JSON（例: [{"name":"バックホウ 0.6m3","unit":"日","quantity":0.01,"unit_price":45000}]）' value={bdForm.machinery} onChange={(e) => setBdForm({ ...bdForm, machinery: e.target.value })} />
              <input className={`${inputCls} col-span-2`} placeholder="注記" value={bdForm.note} onChange={(e) => setBdForm({ ...bdForm, note: e.target.value })} />
            </div>
            <button onClick={() => void createBreakdown()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">歩掛を登録</button>
          </div>
        </div>
      )}
      {!loading && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">歩掛一覧</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">工種</th><th>条件</th><th>労務/材料/機械</th><th>更新</th></tr></thead>
              <tbody>
                {breakdowns.map((b) => (
                  <tr key={b.id} className="border-b border-gray-100 align-top">
                    <td className="py-1">{b.tree_code} {b.tree_name}</td>
                    <td className="py-1 font-mono text-xs">{JSON.stringify(b.condition_json)}</td>
                    <td className="py-1 text-xs">
                      労務 {b.labor.length} / 材料 {b.material.length} / 機械 {b.machinery.length}
                      <div className="text-gray-400">{b.labor.map((r) => r.name).join("・")}</div>
                    </td>
                    <td className="py-1 text-xs">{formatDateTime(b.updated_at)}</td>
                  </tr>
                ))}
                {breakdowns.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">歩掛がありません</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">CSV/Excel取込（既存システム・書籍のエクスポート）</h2>
            <div className="flex items-center gap-3">
              <input type="file" accept=".csv,.xlsx" className="text-sm" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => void doImport()} disabled={!importFile} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
                取込
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
