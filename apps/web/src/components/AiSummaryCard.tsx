"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatPeriod } from "@/lib/utils";
import type { AiAudience, AiSummaryResponse } from "@/types/api";

const AUDIENCE_OPTIONS: Array<{ value: AiAudience; label: string }> = [
  { value: "default", label: "標準" },
  { value: "executive", label: "経営層" },
  { value: "estimator", label: "積算" },
  { value: "client", label: "発注者" },
];

export default function AiSummaryCard({
  regionId,
  compact = false,
}: {
  regionId?: string;
  compact?: boolean;
}) {
  const [summary, setSummary] = useState<AiSummaryResponse | null>(null);
  const [audience, setAudience] = useState<AiAudience>("default");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const load = useCallback(
    async (aud: AiAudience) => {
      setLoading(true);
      setError(null);
      setFeedbackSent(false);
      try {
        setSummary(await api.aiSummary({ audience: aud, region_id: regionId }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "不明なエラー");
      } finally {
        setLoading(false);
      }
    },
    [regionId]
  );

  useEffect(() => {
    void load(audience);
    // audience変更はボタンハンドラで明示的にloadするため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId]);

  const sendFeedback = async (rating: "good" | "bad") => {
    if (!summary?.audit_id) return;
    try {
      await api.aiFeedback({ audit_id: summary.audit_id, rating });
      setFeedbackSent(true);
    } catch {
      // フィードバック失敗は表示に影響させない
    }
  };

  return (
    <div className="cci-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">
          AIによる今月の要点
          {summary?.base_period && <span className="ml-2 text-xs font-normal text-gray-400">対象: {formatPeriod(summary.base_period)}</span>}
        </h3>
        <div className="flex items-center gap-1 text-xs">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setAudience(opt.value);
                void load(opt.value);
              }}
              className={`rounded-md px-2 py-1 ${audience === opt.value ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-gray-600"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="py-6 text-center text-sm text-gray-400">要約を生成中…</div>}
      {error && <div className="mt-2 rounded bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      {!loading && summary && (
        <>
          <div className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-gray-800">{summary.summary}</div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
            <div>
              <span className={`mr-2 rounded px-1.5 py-0.5 font-semibold ${summary.generated_by === "ai" ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-600"}`}>
                {summary.generated_by === "ai" ? `AI生成（${summary.model ?? summary.provider}）` : "ルール生成"}
              </span>
              出典: {summary.sources.map((s) => s.source_name).join("／") || "―"}
            </div>
            <div className="flex items-center gap-2">
              {summary.audit_id && !feedbackSent && (
                <>
                  <button onClick={() => void sendFeedback("good")} className="rounded border border-gray-200 px-1.5 py-0.5 hover:bg-gray-50">👍 役立った</button>
                  <button onClick={() => void sendFeedback("bad")} className="rounded border border-gray-200 px-1.5 py-0.5 hover:bg-gray-50">👎 不正確</button>
                </>
              )}
              {feedbackSent && <span className="text-green-600">評価を送信しました</span>}
              {compact && (
                <Link href="/ai" className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                  詳しく分析 →
                </Link>
              )}
            </div>
          </div>
          {summary.warnings.length > 0 && (
            <div className="mt-2 rounded bg-amber-50 p-2 text-[11px] text-amber-800">
              {summary.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
          <div className="mt-1 text-[10px] text-gray-300">{summary.disclaimer}</div>
        </>
      )}
    </div>
  );
}
