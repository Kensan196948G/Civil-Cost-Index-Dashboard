"use client";

import { useCallback, useEffect, useState } from "react";
import AiSummaryCard from "@/components/AiSummaryCard";
import { ErrorMessage } from "@/components/Status";
import { api } from "@/lib/api";
import { downloadBlob, formatPeriod, formatRate } from "@/lib/utils";
import type { AiAlertsResponse, AiReportResponse, AiStatus, AiTemplate } from "@/types/api";

const REPORT_TYPES = [
  { value: "monthly", label: "月次市況レポート" },
  { value: "executive", label: "経営会議向け要約" },
  { value: "estimator", label: "積算担当者向け詳細" },
  { value: "client", label: "発注者向け説明資料" },
];

export default function AiNavPage() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [templates, setTemplates] = useState<AiTemplate[]>([]);
  const [alerts, setAlerts] = useState<AiAlertsResponse | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [report, setReport] = useState<AiReportResponse | null>(null);
  const [reportType, setReportType] = useState("monthly");
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [st, tpl] = await Promise.all([api.aiStatus(), api.aiTemplates()]);
        setStatus(st);
        setTemplates(tpl.templates);
      } catch (e) {
        setError(e instanceof Error ? e.message : "不明なエラー");
      }
    })();
  }, []);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setError(null);
    try {
      setAlerts(await api.aiAlertsExplain({ limit: 10 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const generateReport = useCallback(async (type: string) => {
    setReportLoading(true);
    setError(null);
    try {
      setReport(await api.aiReport({ report_type: type }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setReportLoading(false);
    }
  }, []);

  const runTemplate = (t: AiTemplate) => {
    if (t.action.type === "alerts") void loadAlerts();
    else if (t.action.type === "report") {
      setReportType(t.action.report_type);
      void generateReport(t.action.report_type);
    } else if (t.action.type === "quality") {
      window.location.href = "/admin/ai";
    }
    // summary系テンプレートは上部カードのオーディエンス切替で対応
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">AI市況ナビ</h1>
        {status && (
          <div className="text-xs text-gray-500">
            <span className={`mr-1 rounded px-2 py-0.5 font-semibold ${status.ai_enabled ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-600"}`}>
              {status.ai_enabled ? `AI有効（${status.provider}${status.model ? ` / ${status.model}` : ""}）` : "AI未設定（ルール生成で動作中）"}
            </span>
          </div>
        )}
      </div>

      {error && <ErrorMessage message={error} />}

      <AiSummaryCard />

      {/* 分析テンプレート */}
      <div className="cci-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">分析テンプレート</h3>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => runTemplate(t)}
              title={t.description}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 hover:border-blue-300 hover:bg-blue-50"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* AIアラート説明 */}
        <div className="cci-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">アラート説明</h3>
            <button onClick={() => void loadAlerts()} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
              再生成
            </button>
          </div>
          {alertsLoading && <div className="py-6 text-center text-sm text-gray-400">説明を生成中…</div>}
          {!alertsLoading && alerts && alerts.alerts.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-400">現在アラートはありません</div>
          )}
          {!alertsLoading && alerts && alerts.alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.alerts.map((a, i) => (
                <div key={i} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        a.priority === "high" ? "bg-red-100 text-red-700" : a.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {a.priority.toUpperCase()}
                    </span>
                    <span className="font-semibold">{a.item_name}</span>
                    <span className="text-gray-500">{a.region_name}</span>
                    <span className="text-xs text-gray-400">{formatPeriod(a.period)}</span>
                    <span className="text-xs">前月比 {formatRate(a.mom_rate)} / 前年比 {formatRate(a.yoy_rate)}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-700">{a.explanation}</p>
                </div>
              ))}
              <div className="text-[10px] text-gray-300">{alerts.disclaimer}</div>
            </div>
          )}
        </div>

        {/* AIレポート生成 */}
        <div className="cci-card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-800">AIレポート生成</h3>
            <div className="flex items-center gap-2">
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
              >
                {REPORT_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void generateReport(reportType)}
                disabled={reportLoading}
                className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {reportLoading ? "生成中…" : "生成"}
              </button>
            </div>
          </div>
          {!report && !reportLoading && (
            <div className="py-6 text-center text-sm text-gray-400">レポート種類を選んで「生成」を押してください</div>
          )}
          {report && (
            <>
              <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400">
                <span>
                  {report.report_type_label}（対象: {formatPeriod(report.base_period)}・
                  {report.generated_by === "ai" ? `AI生成 ${report.model ?? report.provider}` : "ルール生成"}）
                </span>
                <button
                  onClick={() => downloadBlob(new Blob([report.markdown], { type: "text/markdown" }), `cci-report-${report.report_type}.md`)}
                  className="rounded border border-gray-200 px-2 py-0.5 text-gray-600 hover:bg-gray-50"
                >
                  ⤓ Markdown保存
                </button>
              </div>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">{report.markdown}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
