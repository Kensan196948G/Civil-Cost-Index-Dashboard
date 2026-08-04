"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs } from "@/lib/utils";
import type { EstimationBase } from "@/types/api";

const RATE_LABELS: Record<string, string> = {
  common_temp: "共通仮設費率",
  site_management: "現場管理費率",
  general_management: "一般管理費等率",
};

export default function EstimationBasesPage() {
  const [bases, setBases] = useState<EstimationBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [form, setForm] = useState({
    base_code: "", base_name: "", category: "general_civil", fiscal_year: "2026",
    applicable_from: "2026-04-01", status: "draft", source_type: "mlit_electronic",
    source_note: "", rounding_rules: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.estimationBases();
      setBases(res.estimation_bases);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
    void load();
  }, [load]);

  const create = async () => {
    setNotice(null);
    try {
      await api.createEstimationBase({
        base_code: form.base_code,
        base_name: form.base_name,
        category: form.category,
        fiscal_year: Number(form.fiscal_year),
        applicable_from: form.applicable_from,
        status: form.status,
        source_type: form.source_type || null,
        source_note: form.source_note || null,
        rounding_rules: form.rounding_rules ? JSON.parse(form.rounding_rules) : undefined,
      });
      setNotice("積算基準を登録しました。");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const saveRate = async (baseId: string, rateType: string, rate: number) => {
    setNotice(null);
    try {
      await api.upsertOverheadRate(baseId, rateType, { rate });
      setNotice("諸経費率を保存しました。");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">積算基準管理</h1>
      <p className="text-sm text-gray-600">
        積算基準（年度・適用日・端数処理）と諸経費率（共通仮設費・現場管理費・一般管理費等）を管理します。
        正式データ投入までのサンプル基準が登録済みです。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">基準一覧・諸経費率</h2>
            <div className="mb-3">
              <label className={labelCls}>管理者キー（X-Admin-Key）</label>
              <input type="password" className={inputCls} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                  <th className="py-2">基準</th><th>年度</th><th>適用</th><th>状態</th>
                  <th>共通仮設</th><th>現場管理</th><th>一般管理</th>
                </tr>
              </thead>
              <tbody>
                {bases.map((b) => (
                  <tr key={b.id} className="border-b border-gray-100 align-top">
                    <td className="py-2">
                      <div className="font-semibold">{b.base_name}</div>
                      <div className="text-xs text-gray-400">{b.base_code} / {b.category} / {b.source_type ?? "—"}</div>
                      {b.source_note && <div className="mt-1 max-w-[260px] text-xs text-gray-500">{b.source_note}</div>}
                    </td>
                    <td className="py-2">{b.fiscal_year}</td>
                    <td className="py-2 text-xs">{b.applicable_from}{b.applicable_to ? ` 〜 ${b.applicable_to}` : ""}</td>
                    <td className="py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${b.status === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                        {b.status}
                      </span>
                    </td>
                    {(["common_temp", "site_management", "general_management"] as const).map((rt) => (
                      <td key={rt} className="py-2">
                        <div className="text-xs text-gray-500">{RATE_LABELS[rt]}</div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step={0.0001}
                            defaultValue={(b.rates.find((r) => r.rate_type === rt)?.rate ?? 0) * 100}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-gray-400">%</span>
                          <button
                            onClick={(e) => {
                              const input = e.currentTarget.previousElementSibling?.previousElementSibling as HTMLInputElement | null;
                              if (input) void saveRate(b.id, rt, Number(input.value) / 100);
                            }}
                            className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                          >
                            保存
                          </button>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">新規基準</h2>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className={labelCls}>コード*</label>
                <input className={inputCls} value={form.base_code} onChange={(e) => setForm({ ...form, base_code: e.target.value })} placeholder="MLIT-2027" />
              </div>
              <div>
                <label className={labelCls}>名称*</label>
                <input className={inputCls} value={form.base_name} onChange={(e) => setForm({ ...form, base_name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>区分</label>
                <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="general_civil">一般土木</option>
                  <option value="port">港湾</option>
                  <option value="other">その他</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>年度*</label>
                <input className={inputCls} type="number" value={form.fiscal_year} onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>適用開始*</label>
                <input className={inputCls} type="date" value={form.applicable_from} onChange={(e) => setForm({ ...form, applicable_from: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>状態</label>
                <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="draft">下書き</option>
                  <option value="approved">承認済み</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>データ経路</label>
                <select className={inputCls} value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
                  <option value="mlit_electronic">国交省公表資料の電子化</option>
                  <option value="book_entry">書籍から整備</option>
                  <option value="system_export">既存システムからエクスポート</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>端数規則（JSON・任意）</label>
                <input className={inputCls} value={form.rounding_rules} onChange={(e) => setForm({ ...form, rounding_rules: e.target.value })} placeholder='{"direct_cost":"yen_down"}' />
              </div>
              <div className="md:col-span-4">
                <label className={labelCls}>備考</label>
                <input className={inputCls} value={form.source_note} onChange={(e) => setForm({ ...form, source_note: e.target.value })} />
              </div>
            </div>
            <button onClick={() => void create()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">登録</button>
          </div>
        </>
      )}
    </div>
  );
}
