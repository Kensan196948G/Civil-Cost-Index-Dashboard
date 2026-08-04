"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs, formatDateTime } from "@/lib/utils";
import type { StagedIngestion } from "@/types/api";

const STATUS_LABEL: Record<string, string> = { pending: "承認待ち", approved: "承認済み", rejected: "却下" };

export default function StagedPage() {
  const [staged, setStaged] = useState<StagedIngestion[]>([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.stagedIngestions(filter);
      setStaged(res.staged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
  }, []);

  useEffect(() => { if (adminKey) void load(); }, [adminKey, load]);

  const approve = async (id: string) => {
    setNotice(null);
    try {
      const res = await api.approveStaged(id);
      setNotice(`本番反映しました: ${JSON.stringify(res.result)}`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "承認処理に失敗しました");
    }
  };

  const reject = async (id: string) => {
    try {
      await api.rejectStaged(id);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "却下処理に失敗しました");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("この承認待ちデータを削除しますか？")) return;
    try {
      await api.deleteStaged(id);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">承認待ちデータ（定期取込）</h1>
      <p className="text-sm text-gray-600">
        定期取得でダウンロードされたデータを確認し、本番DBへ反映（承認）するか却下します。承認者はデータ承認者・積算責任者・システム管理者です。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      <div className="flex gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded border px-3 py-1.5 text-sm ${filter === s ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {loading && <LoadingState />}
      {!loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                <th className="py-2">データソース</th><th>ファイル</th><th>行数</th>
                <th>作成者</th><th>作成日時</th><th>状態</th><th></th>
              </tr>
            </thead>
            <tbody>
              {staged.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="py-2">{s.source_name}</td>
                  <td className="py-2 text-xs">{s.file_name ?? "—"}</td>
                  <td className="py-2 text-xs">{s.total_rows}（エラー {s.error_rows}）</td>
                  <td className="py-2 text-xs">{s.created_by}</td>
                  <td className="py-2 text-xs">{formatDateTime(s.created_at)}</td>
                  <td className="py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${s.status === "pending" ? "bg-amber-100 text-amber-800" : s.status === "approved" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className="py-2 whitespace-nowrap text-xs">
                    {s.status === "pending" && (
                      <>
                        <button onClick={() => void approve(s.id)} className="mr-2 rounded border border-green-300 px-2 py-1 text-green-700 hover:bg-green-50">承認して反映</button>
                        <button onClick={() => void reject(s.id)} className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50">却下</button>
                      </>
                    )}
                    <button onClick={() => void remove(s.id)} className="ml-2 rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">削除</button>
                  </td>
                </tr>
              ))}
              {staged.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-gray-400">データがありません</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
