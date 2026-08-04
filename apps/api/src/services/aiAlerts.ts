import type { Sql } from "../lib/db";
import type { Env, RatePoint } from "../types";
import { generateAiText, getAiProviderInfo } from "../lib/ai";
import { listAlerts } from "./alerts";
import { computeStreak } from "./aiFacts";
import { recordAiAudit } from "./aiAudit";

export const ALERT_EXPLAIN_PROMPT_VERSION = "alert-explain-v1";

export type AlertWithContext = {
  item_name: string;
  region_name: string;
  period: string;
  mom_rate: number | null;
  yoy_rate: number | null;
  reason: string;
  priority: string;
  streak: number;
  threshold_mom: number;
  threshold_yoy: number;
};

/**
 * ルール生成のアラート説明。アラート判定・連続月数はすべて統計処理で確定済み。
 */
export function buildFallbackExplanation(a: AlertWithContext): string {
  const parts: string[] = [];
  const dir = (a.yoy_rate ?? a.mom_rate ?? 0) >= 0 ? "上昇" : "下落";
  if (a.yoy_rate != null) {
    parts.push(`${a.item_name}（${a.region_name}）は前年同月比${a.yoy_rate > 0 ? "+" : ""}${a.yoy_rate}%と${dir}しています`);
    if (Math.abs(a.yoy_rate) >= a.threshold_yoy) {
      parts.push(`設定閾値±${a.threshold_yoy}%を超えています`);
    }
  } else if (a.mom_rate != null) {
    parts.push(`${a.item_name}（${a.region_name}）は前月比${a.mom_rate > 0 ? "+" : ""}${a.mom_rate}%と${dir}しています`);
  }
  if (Math.abs(a.streak) >= 3) {
    const streakDir = a.streak > 0 ? "上昇" : "下落";
    parts.push(`${Math.abs(a.streak)}か月連続${streakDir}しており、一時的な変動より継続的な${streakDir}傾向の可能性があります`);
  }
  return parts.join("。") + "。";
}

export function buildAlertExplainPrompt(alerts: AlertWithContext[]): { system: string; prompt: string } {
  const system = [
    "あなたは建設コストダッシュボードのアラート説明アシスタントです。",
    "アラート判定（閾値超過・連続上昇）はすべてシステム側で確定済みです。あなたの役割は各アラートの意味を1〜2文で説明することだけです。",
    "ルール:",
    "1. 与えられた数値のみ使用し、計算・推測をしない。",
    "2. 原因の断定や将来予測をしない。",
    "3. 各アラートについて「説明: 」で始まる1行を出力する。順序は入力どおり。",
    "4. 日本語で書く。",
  ].join("\n");
  const prompt = alerts
    .map(
      (a, i) =>
        `${i + 1}. ${a.item_name}（${a.region_name}） ${a.period} 前月比${a.mom_rate ?? "―"}% 前年比${a.yoy_rate ?? "―"}% 連続${a.streak}か月 判定理由: ${a.reason}（閾値: 前月比±${a.threshold_mom}%・前年比±${a.threshold_yoy}%）`
    )
    .join("\n");
  return { system, prompt };
}

export async function explainAlerts(
  sql: Sql,
  env: Env,
  opts: { thresholdMom?: number; thresholdYoy?: number; limit?: number } = {}
) {
  const thresholdMom = opts.thresholdMom ?? 5;
  const thresholdYoy = opts.thresholdYoy ?? 10;
  const limit = opts.limit ?? 10;
  const alerts = await listAlerts(sql, thresholdMom, thresholdYoy, limit);

  // 連続上昇/下落月数をシリーズ再取得で確定する
  const withContext: AlertWithContext[] = [];
  for (const a of alerts) {
    const rows = await sql`
      SELECT to_char(t.period_date, 'YYYY-MM') AS period, t.value::text AS value
      FROM time_series_values t
      JOIN items i ON i.id = t.item_id
      JOIN regions r ON r.id = t.region_id
      WHERE i.item_name = ${a.item_name} AND r.region_name = ${a.region_name}
        AND t.period_date >= (SELECT max(period_date) - interval '25 months' FROM time_series_values)
      ORDER BY t.period_date ASC
    `;
    const points: RatePoint[] = rows.map((r) => ({ period: String(r.period), value: Number(r.value) }));
    withContext.push({
      ...a,
      streak: computeStreak(points),
      threshold_mom: thresholdMom,
      threshold_yoy: thresholdYoy,
    });
  }

  const providerInfo = getAiProviderInfo(env);
  const fallbacks = withContext.map((a) => buildFallbackExplanation(a));
  let explanations = fallbacks;
  let generatedBy: "ai" | "rule" = "rule";
  let auditStatus = "fallback";
  let errorMessage: string | null = null;

  if (providerInfo.provider !== "none" && withContext.length > 0) {
    try {
      const { system, prompt } = buildAlertExplainPrompt(withContext);
      const result = await generateAiText(env, { system, prompt, maxTokens: 2000 });
      if (result && result.text) {
        const lines = result.text
          .split("\n")
          .map((l) => l.replace(/^\s*\d+[.．)]?\s*/, "").replace(/^説明[:：]\s*/, "").trim())
          .filter(Boolean);
        if (lines.length >= withContext.length) {
          explanations = lines.slice(0, withContext.length);
          generatedBy = "ai";
          auditStatus = "success";
        }
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      auditStatus = "error";
    }
  }

  const auditId = await recordAiAudit(sql, {
    feature: "alert_explain",
    question: `threshold_mom=${thresholdMom} threshold_yoy=${thresholdYoy} limit=${limit}`,
    provider: generatedBy === "ai" ? providerInfo.provider : "rule-based",
    model: generatedBy === "ai" ? providerInfo.model : null,
    promptVersion: ALERT_EXPLAIN_PROMPT_VERSION,
    dataScope: { alerts: withContext.length },
    responseText: explanations.join("\n"),
    sources: null,
    status: auditStatus,
    errorMessage,
  });

  return {
    generated_by: generatedBy,
    provider: generatedBy === "ai" ? providerInfo.provider : "rule-based",
    model: generatedBy === "ai" ? providerInfo.model : null,
    audit_id: auditId,
    alerts: withContext.map((a, i) => ({
      item_name: a.item_name,
      region_name: a.region_name,
      period: a.period,
      mom_rate: a.mom_rate,
      yoy_rate: a.yoy_rate,
      reason: a.reason,
      priority: a.priority,
      streak: a.streak,
      explanation: explanations[i] ?? fallbacks[i],
    })),
    disclaimer: "アラート判定はルール・統計処理による確定値です。説明文はAI/ルールによる自動生成の参考情報です。",
  };
}
