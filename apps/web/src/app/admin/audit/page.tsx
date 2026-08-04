"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs, formatDateTime } from "@/lib/utils";
import type { OperationAuditLog } from "@/types/api";

export default function AuditPage() {
  const [logs, setLogs] = useState<OperationAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.operationAudit({ limit: 200 });
      setLogs(res.logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
  }, []);

  useEffect(() => { if (adminKey) void load(); }, [adminKey, load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">操作監査ログ</h1>
      <p className="text-sm text-gray-600">
        単価版の作成・承認・失効、定期取込、案件の作成・編集、ユーザー管理などの個人単位の操作履歴です（閲覧は監査者・システム管理者）。
      </p>
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                <th className="py-2">日時</th><th>操作者</th><th>役割</th><th>操作</th><th>対象</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="py-2 whitespace-nowrap text-xs">{formatDateTime(l.created_at)}</td>
                  <td className="py-2 text-xs">{l.actor_email}</td>
                  <td className="py-2 text-xs">{l.actor_role ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">{l.action}</td>
                  <td className="py-2 text-xs">{l.resource_type ?? "—"}{l.resource_id ? ` / ${l.resource_id.slice(0, 8)}…` : ""}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400">監査ログがありません</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
