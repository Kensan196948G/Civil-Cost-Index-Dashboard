"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatDateTime, formatPeriod, loadPrefs, savePrefs } from "@/lib/utils";
import type { AiAuditLog, AiQualityResponse, AiStatus } from "@/types/api";

const ISSUE_TYPE_LABELS: Record<string, string> = {
  stale: "更新遅延",
  gap: "欠損月",
  constant: "固定値",
  outlier: "外れ値",
  name_variant: "表記揺れ",
};

export default function AiAdminPage() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [quality, setQuality] = useState<AiQualityResponse | null>(null);
  const [qualityLoading, setQualityLoading] = useState(true);
  const [logs, setLogs] = useState<AiAuditLog[] | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
    void (async () => {
      try {
        setStatus(await api.aiStatus());
      } catch {
        // ステータス取得失敗は致命的ではない
      }
    })();
  }, []);

  const loadQuality = useCallback(async () => {
    setQualityLoading(true);
    setError(null);
    try {
      setQuality(await api.aiQuality());
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setQualityLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuality();
  }, [loadQuality]);

  const loadAudit = useCallback(async () => {
    setLogsLoading(true);
    setAuditError(null);
    try {
      savePrefs({ ...loadPrefs(), adminKey });
      const res = await api.aiAudit(adminKey, { limit: 100 });
      setLogs(res.logs);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLogsLoading(false);
    }
  }, [adminKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">AI管理</h1>
        {status && (
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${status.ai_enabled ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-600"}`}>
            {status.ai_enabled ? `AI有効（${status.provider}${status.model ? ` / ${status.model}` : ""}）` : "AI未設定（ルール生成で動作中）"}
          </span>
        )}
      </div>

      {error && <ErrorMessage message={error} onRetry={() => void loadQuality()} />}

      {/* データ品質チェック */}
      <div className="cci-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            データ品質チェック
            {quality && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                対象 {quality.checked_series} 系列・最新 {formatPeriod(quality.latest_period)}
              </span>
            )}
          </h3>
          <button onClick={() => void loadQuality()} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
            再チェック
          </button>
        </div>
        {qualityLoading && <LoadingState label="品質チェック実行中…" />}
        {!qualityLoading && quality && (
          <>
            {/* 品質スコア */}
            <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {quality.quality_scores.map((s) => (
                <div key={s.source_name} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">{s.source_name}</span>
                    <span className={`text-lg font-bold ${s.score >= 80 ? "text-green-600" : s.score >= 60 ? "text-amber-600" : "text-red-600"}`}>
                      {s.score}
                      <span className="text-xs font-normal text-gray-400">/100</span>
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    最新性 {s.breakdown.freshness}・完全性 {s.breakdown.completeness}・一貫性 {s.breakdown.consistency}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">{s.note}</div>
                </div>
              ))}
              {quality.quality_scores.length === 0 && <div className="text-sm text-gray-400">データソースがありません</div>}
            </div>

            {/* 確認候補一覧 */}
            {quality.issues.length === 0 ? (
              <div className="rounded bg-green-50 p-3 text-sm text-green-700">確認候補は検出されませんでした。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-1.5 pr-2">種別</th>
                      <th className="py-1.5 pr-2">重要度</th>
                      <th className="py-1.5 pr-2">品目</th>
                      <th className="py-1.5 pr-2">地域</th>
                      <th className="py-1.5">内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quality.issues.map((issue, i) => (
                      <tr key={i} className="border-b border-gray-50 align-top">
                        <td className="py-1.5 pr-2 whitespace-nowrap">{ISSUE_TYPE_LABELS[issue.type] ?? issue.type}</td>
                        <td className="py-1.5 pr-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              issue.severity === "high" ? "bg-red-100 text-red-700" : issue.severity === "medium" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {issue.severity.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2">{issue.item_name}</td>
                        <td className="py-1.5 pr-2">{issue.region_name ?? "―"}</td>
                        <td className="py-1.5 text-gray-600">{issue.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-2 text-[11px] text-gray-400">{quality.note}</div>
          </>
        )}
      </div>

      {/* AI利用監査ログ */}
      <div className="cci-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">AI利用監査ログ</h3>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="管理者キー"
              className="rounded-md border border-gray-200 px-2 py-1 text-xs"
            />
            <button onClick={() => void loadAudit()} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700">
              表示
            </button>
          </div>
        </div>
        {auditError && <div className="rounded bg-red-50 p-3 text-xs text-red-700">{auditError}</div>}
        {logsLoading && <LoadingState label="監査ログ取得中…" />}
        {!logsLoading && logs && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-1.5 pr-2">日時</th>
                  <th className="py-1.5 pr-2">機能</th>
                  <th className="py-1.5 pr-2">プロバイダー</th>
                  <th className="py-1.5 pr-2">状態</th>
                  <th className="py-1.5 pr-2">応答時間</th>
                  <th className="py-1.5 pr-2">トークン</th>
                  <th className="py-1.5 pr-2">評価</th>
                  <th className="py-1.5">応答（先頭）</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td className="py-1.5 pr-2">{log.feature}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{log.provider}{log.model ? ` (${log.model})` : ""}</td>
                    <td className="py-1.5 pr-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${log.status === "success" ? "bg-green-100 text-green-700" : log.status === "fallback" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-700"}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">{log.duration_ms != null ? `${log.duration_ms}ms` : "―"}</td>
                    <td className="py-1.5 pr-2">{log.input_tokens != null ? `${log.input_tokens}/${log.output_tokens ?? "―"}` : "―"}</td>
                    <td className="py-1.5 pr-2">{log.rating ?? "―"}</td>
                    <td className="py-1.5 max-w-[360px] truncate text-gray-500">{log.response_preview}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-gray-400">監査ログがありません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!logsLoading && !logs && !auditError && (
          <div className="py-4 text-center text-sm text-gray-400">管理者キーを入力して「表示」を押してください（キー未設定環境では空欄のまま表示できます）</div>
        )}
      </div>
    </div>
  );
}
