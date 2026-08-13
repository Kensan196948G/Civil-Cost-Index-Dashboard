"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs, formatDateTime } from "@/lib/utils";
import type { DataSource, FetchSchedule } from "@/types/api";

export default function SchedulesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [schedules, setSchedules] = useState<FetchSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [form, setForm] = useState({
    data_source_id: "", schedule_name: "", schedule_type: "monthly", expected_day: "25",
    expected_interval_days: "40", approval_required: true, channels: ["teams", "slack"] as string[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, s] = await Promise.all([api.dataSources(), api.fetchSchedules()]);
      setSources(d.data_sources);
      setSchedules(s.schedules);
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
      await api.createFetchSchedule({
        data_source_id: form.data_source_id,
        schedule_name: form.schedule_name || null,
        schedule_type: form.schedule_type as "daily" | "monthly" | "yearly",
        expected_day: form.expected_day ? Number(form.expected_day) : null,
        expected_interval_days: form.expected_interval_days ? Number(form.expected_interval_days) : null,
        approval_required: form.approval_required,
        notify_channels: form.channels,
      });
      setNotice("定期取得スケジュールを登録しました。");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const toggle = async (s: FetchSchedule) => {
    try {
      await api.patchFetchSchedule(s.id, { enabled: !s.enabled });
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  const runNow = async (s: FetchSchedule) => {
    setNotice(null);
    try {
      const res = await api.runFetchSchedule(s.id);
      setNotice(`実行結果: ${JSON.stringify(res.result)}`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "実行に失敗しました");
    }
  };

  const remove = async (s: FetchSchedule) => {
    if (!window.confirm(`${s.source_name} のスケジュールを削除しますか？`)) return;
    try {
      await api.deleteFetchSchedule(s.id);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">定期取得スケジュール</h1>
      <p className="text-sm text-gray-600">
        Cloudflare Cron（毎日 01:00 JST）で実行します。取得結果はデフォルトで「承認待ち」となり、データ承認者が本番反映します。
        未更新・取得失敗は Teams / Slack へ通知されます。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">スケジュール一覧</h2>
            {schedules.length === 0 ? (
              <EmptyState label="定期取得スケジュールが登録されていません" />
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                  <th className="py-2">データソース</th><th>種別</th><th>承認必須</th>
                  <th>通知</th><th>最終実行</th><th>状態</th><th></th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-2">{s.source_name}</td>
                    <td className="py-2 text-xs">
                      {s.schedule_type === "monthly" ? `月次（${s.expected_day ?? "?"}日頃）` : s.schedule_type === "yearly" ? "年次" : "日次"}
                    </td>
                    <td className="py-2 text-xs">{s.approval_required ? "承認待ち経由" : "直接反映"}</td>
                    <td className="py-2 text-xs">{s.notify_channels.join(", ")}</td>
                    <td className="py-2 text-xs">{formatDateTime(s.last_run_at)}</td>
                    <td className="py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${s.enabled ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                        {s.enabled ? "有効" : "停止"} {s.last_status ? `・${s.last_status}` : ""}
                      </span>
                    </td>
                    <td className="py-2 whitespace-nowrap text-xs">
                      <button onClick={() => void runNow(s)} className="mr-2 rounded border border-blue-300 px-2 py-1 text-blue-700 hover:bg-blue-50">今すぐ実行</button>
                      <button onClick={() => void toggle(s)} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">{s.enabled ? "停止" : "有効化"}</button>
                      <button onClick={() => void remove(s)} className="ml-2 rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">新規スケジュール</h2>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className={labelCls}>データソース*</label>
                <select className={inputCls} value={form.data_source_id} onChange={(e) => setForm({ ...form, data_source_id: e.target.value })}>
                  <option value="">選択</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.source_name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>名称</label>
                <input className={inputCls} value={form.schedule_name} onChange={(e) => setForm({ ...form, schedule_name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>頻度</label>
                <select className={inputCls} value={form.schedule_type} onChange={(e) => setForm({ ...form, schedule_type: e.target.value })}>
                  <option value="daily">日次</option>
                  <option value="monthly">月次</option>
                  <option value="yearly">年次</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>公表予定日（1〜31）</label>
                <input className={inputCls} type="number" min={1} max={31} value={form.expected_day} onChange={(e) => setForm({ ...form, expected_day: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>未更新目安（日）</label>
                <input className={inputCls} type="number" value={form.expected_interval_days} onChange={(e) => setForm({ ...form, expected_interval_days: e.target.value })} />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={form.approval_required} onChange={(e) => setForm({ ...form, approval_required: e.target.checked })} />
                承認後に本番反映
              </label>
              <div className="md:col-span-2">
                <label className={labelCls}>通知先</label>
                <div className="flex gap-3 pt-1 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={form.channels.includes("teams")} onChange={(e) => setForm({ ...form, channels: e.target.checked ? [...form.channels, "teams"] : form.channels.filter((c) => c !== "teams") })} />Teams</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={form.channels.includes("slack")} onChange={(e) => setForm({ ...form, channels: e.target.checked ? [...form.channels, "slack"] : form.channels.filter((c) => c !== "slack") })} />Slack</label>
                </div>
              </div>
            </div>
            <button onClick={() => void create()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">登録</button>
          </div>
        </>
      )}
    </div>
  );
}
