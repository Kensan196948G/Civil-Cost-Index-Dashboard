"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { DataSource, DataSourceInput } from "@/types/api";

const EMPTY: DataSourceInput = {
  source_code: "", source_name: "", source_type: "material", provider_name: "", source_url: "", file_format: "csv", update_frequency: "monthly", license_note: "",
};

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [form, setForm] = useState<DataSourceInput>(EMPTY);
  const [adminKey, setAdminKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.dataSources();
      setSources(res.data_sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setNotice(null);
    try {
      await api.createDataSource(form, adminKey);
      setForm(EMPTY);
      setNotice("データソースを登録しました。");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const toggle = async (s: DataSource) => {
    setNotice(null);
    try {
      await api.patchDataSource(s.id, { is_active: !s.is_active }, adminKey);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">データソース管理</h1>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">データソース一覧</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                  <th className="py-2">コード</th>
                  <th>名称</th>
                  <th>形式</th>
                  <th>更新頻度</th>
                  <th>最終取得</th>
                  <th>状態</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-2 font-mono text-xs">{s.source_code}</td>
                    <td className="py-2">{s.source_name}</td>
                    <td className="py-2">{s.file_format ?? "—"}</td>
                    <td className="py-2">{s.update_frequency ?? "—"}</td>
                    <td className="py-2 text-xs">{formatDateTime(s.last_fetched_at)}</td>
                    <td className="py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${s.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                        {s.is_active ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className="py-2">
                      <button onClick={() => void toggle(s)} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                        {s.is_active ? "無効化" : "有効化"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">新規登録</h2>
            <div className="mb-3">
              <label className={labelCls}>管理者キー（X-Admin-Key。未設定なら401表示）</label>
              <input type="password" className={inputCls} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="本番では設定必須" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div>
                <label className={labelCls}>コード*</label>
                <input className={inputCls} value={form.source_code} onChange={(e) => setForm({ ...form, source_code: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>名称*</label>
                <input className={inputCls} value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>種別</label>
                <select className={inputCls} value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
                  <option value="material">資材</option>
                  <option value="labor">労務</option>
                  <option value="index">指数</option>
                  <option value="fuel">燃料</option>
                  <option value="other">その他</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>提供元*</label>
                <input className={inputCls} value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>URL</label>
                <input className={inputCls} value={form.source_url ?? ""} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>形式</label>
                <select className={inputCls} value={form.file_format ?? "csv"} onChange={(e) => setForm({ ...form, file_format: e.target.value })}>
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel</option>
                  <option value="pdf">PDF</option>
                  <option value="api">API</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>更新頻度</label>
                <select className={inputCls} value={form.update_frequency ?? "monthly"} onChange={(e) => setForm({ ...form, update_frequency: e.target.value })}>
                  <option value="monthly">月次</option>
                  <option value="yearly">年次</option>
                  <option value="irregular">不定期</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>利用規約・注記</label>
                <input className={inputCls} value={form.license_note ?? ""} onChange={(e) => setForm({ ...form, license_note: e.target.value })} />
              </div>
            </div>
            <button onClick={() => void create()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
              登録
            </button>
          </div>
        </>
      )}
    </div>
  );
}
