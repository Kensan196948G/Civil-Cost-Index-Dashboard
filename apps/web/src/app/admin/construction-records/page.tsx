"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs, formatNumber, formatDateTime } from "@/lib/utils";
import type { ConstructionRecord, ConstructionSummaryRow, Item } from "@/types/api";

export default function ConstructionRecordsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [itemId, setItemId] = useState("");
  const [records, setRecords] = useState<ConstructionRecord[]>([]);
  const [summary, setSummary] = useState<ConstructionSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [form, setForm] = useState({ work_date: new Date().toISOString().slice(0, 10), quantity: "", amount: "", unit: "", source_note: "" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const i = await api.items();
      setItems(i.items);
      if (!itemId && i.items[0]) setItemId(i.items[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  const loadData = useCallback(async () => {
    if (!itemId) return;
    const [r, s] = await Promise.all([api.constructionRecords({ item_id: itemId }), api.constructionSummary({ item_id: itemId })]);
    setRecords(r.records);
    setSummary(s.summary);
  }, [itemId]);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
    void loadAll();
  }, [loadAll]);
  useEffect(() => { void loadData(); }, [loadData]);

  const create = async () => {
    setNotice(null);
    try {
      await api.createConstructionRecord({
        item_id: itemId,
        work_date: form.work_date,
        quantity: Number(form.quantity),
        amount: Number(form.amount),
        unit: form.unit || undefined,
        source_note: form.source_note || null,
      });
      setNotice("施工実績を登録しました。");
      setForm({ ...form, quantity: "", amount: "", unit: "", source_note: "" });
      await loadData();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const doImport = async () => {
    setNotice(null);
    if (!importFile) return;
    try {
      const res = await api.importConstructionRecords(importFile);
      setNotice(`取込完了: ${res.result.imported}件 ／ エラー ${res.result.errors.length}件`);
      await loadData();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取込に失敗しました");
    }
  };

  const suggestPrice = async () => {
    setNotice(null);
    try {
      const res = await api.suggestPriceFromRecords({ item_id: itemId });
      setNotice(`採用単価候補を作成しました（下書き・単価版ID: ${res.result.price_version_id.slice(0, 8)}…）。単価版管理で承認してください。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "候補作成に失敗しました");
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteConstructionRecord(id);
      await loadData();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";
  const money = (v: string | number) => formatNumber(Number(v));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">施工実績データ（社内実績単価）</h1>
      <p className="text-sm text-gray-600">
        過去案件の実績（数量・金額）を蓄積し、品目別の実績単価（平均・中央値・範囲）から採用単価候補を作成できます。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void loadAll()} />}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>品目</label>
          <select className="w-72 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>管理者キー</label>
          <input type="password" className={inputCls} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
        </div>
      </div>
      {loading && <LoadingState />}
      {!loading && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">実績単価サマリー</h2>
              {summary.length === 0 && <div className="py-4 text-center text-sm text-gray-400">実績がありません</div>}
              {summary.map((s) => (
                <table key={s.item_code} className="w-full text-sm">
                  <tbody>
                    <tr className="border-b"><td className="py-1">件数</td><td className="py-1 text-right">{s.record_count}件</td></tr>
                    <tr className="border-b"><td className="py-1">平均単価</td><td className="py-1 text-right">{money(s.avg_unit_price)} {s.unit ?? ""}</td></tr>
                    <tr className="border-b"><td className="py-1">中央値</td><td className="py-1 text-right">{money(s.median_unit_price)} {s.unit ?? ""}</td></tr>
                    <tr className="border-b"><td className="py-1">範囲</td><td className="py-1 text-right">{money(s.min_unit_price)} 〜 {money(s.max_unit_price)}</td></tr>
                  </tbody>
                </table>
              ))}
              <button onClick={() => void suggestPrice()} disabled={summary.length === 0} className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
                採用単価候補を作成（下書き）
              </button>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">実績の登録・取込</h2>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} />
                <input className={inputCls} type="number" placeholder="数量*" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                <input className={inputCls} type="number" placeholder="金額*" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                <input className={inputCls} placeholder="単位" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                <input className={`${inputCls} col-span-2`} placeholder="出典・備考" value={form.source_note} onChange={(e) => setForm({ ...form, source_note: e.target.value })} />
              </div>
              <button onClick={() => void create()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">実績を登録</button>
              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="mb-1 text-xs text-gray-500">CSV/Excel列: item_code, work_date, quantity, amount, unit, supplier_name, source_note</div>
                <div className="flex items-center gap-3">
                  <input type="file" accept=".csv,.xlsx" className="text-sm" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
                  <button onClick={() => void doImport()} disabled={!importFile} className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">取込</button>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">実績一覧</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">施工日</th><th>品目</th><th>数量</th><th>金額</th><th>単価</th><th>備考</th><th></th></tr></thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-1">{r.work_date}</td>
                    <td className="py-1">{r.item_name}</td>
                    <td className="py-1 text-right">{formatNumber(r.quantity)} {r.unit ?? ""}</td>
                    <td className="py-1 text-right">{money(r.amount)}</td>
                    <td className="py-1 text-right">{money(r.unit_price)}</td>
                    <td className="py-1 text-xs">{r.source_note ?? "—"}</td>
                    <td className="py-1"><button onClick={() => void remove(r.id)} className="text-xs text-red-600 hover:underline">削除</button></td>
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
