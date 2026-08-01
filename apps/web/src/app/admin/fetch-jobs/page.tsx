"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { FetchJob } from "@/types/api";

const STATUS_LABEL: Record<string, string> = {
  success: "成功",
  failed: "失敗",
  partial_success: "一部成功",
  pending: "処理中",
};

export default function FetchJobsPage() {
  const [jobs, setJobs] = useState<FetchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.fetchJobs({ limit: 100 });
      setJobs(res.fetch_jobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">データ取込履歴</h1>
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                <th className="py-2">開始</th>
                <th>データソース</th>
                <th>種別</th>
                <th>ファイル</th>
                <th>状態</th>
                <th>成功/エラー</th>
                <th>エラー詳細</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 whitespace-nowrap text-xs">{formatDateTime(j.started_at)}</td>
                  <td className="py-2">{j.data_source_name}</td>
                  <td className="py-2 text-xs">{j.job_type === "manual_fetch" ? "URL取得" : "手動取込"}</td>
                  <td className="py-2 font-mono text-xs">{j.file_name ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">
                    {j.original_url ? (
                      <a href={j.original_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        取得元
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${j.status === "success" ? "bg-green-100 text-green-700" : j.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {STATUS_LABEL[j.status] ?? j.status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {j.success_rows ?? 0} / {j.error_rows ?? 0}
                  </td>
                  <td className="py-2 text-xs">
                    {j.error_detail && j.error_detail.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-amber-700">{j.error_detail.length} 件</summary>
                        <ul className="mt-1 list-disc pl-4 text-gray-600">
                          {j.error_detail.slice(0, 10).map((e, i) => (
                            <li key={i}>
                              行{e.row} {e.column}: {e.reason}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-gray-500">
                    取込履歴がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
