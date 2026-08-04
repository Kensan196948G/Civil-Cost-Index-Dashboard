import type { Sql } from "../lib/db";
import type { Env } from "../types";
import { generateAiText, getAiProviderInfo } from "../lib/ai";
import { collectMarketFacts, type MarketFacts, type SeriesFact } from "./aiFacts";
import { recordAiAudit } from "./aiAudit";

export const SUMMARY_PROMPT_VERSION = "summary-v1";

export type Audience = "default" | "executive" | "estimator" | "client";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  default: "標準",
  executive: "経営層向け",
  estimator: "積算担当者向け",
  client: "発注者向け",
};

const AUDIENCE_INSTRUCTIONS: Record<Audience, string> = {
  default: "実務者向けに、事実を簡潔かつ正確に説明してください。",
  executive: "経営層向けに、要点を3〜4文で簡潔にまとめ、経営判断に関わる示唆を中心にしてください。専門用語は避けてください。",
  estimator: "積算担当者向けに、概算原価への影響確認が必要な資材と変動率を具体的に示してください。",
  client: "発注者への説明資料として使える、丁寧で慎重な表現にしてください。断定的な予測は避けてください。",
};

function formatRate(rate: number | null): string {
  if (rate == null) return "―";
  return `${rate > 0 ? "+" : ""}${rate}%`;
}

function factLine(f: SeriesFact): string {
  const streakNote =
    f.streak >= 3 ? `（${f.streak}か月連続上昇）` : f.streak <= -3 ? `（${-f.streak}か月連続下落）` : "";
  return `${f.item_name}（${f.region_name}）: 前年比${formatRate(f.yoy_rate)}・前月比${formatRate(f.mom_rate)}${streakNote}`;
}

/** AI未設定時のルール生成サマリー。数値はすべて統計処理の結果をそのまま使用する。 */
export function buildFallbackSummary(facts: MarketFacts): string {
  const lines: string[] = [];
  const period = facts.latest_period ?? "不明";
  lines.push(`【${period} 市況要約（ルール生成）】`);
  if (facts.series_count === 0) {
    lines.push("対象期間のデータがありません。データ取込状況を確認してください。");
    return lines.join("\n");
  }
  if (facts.top_yoy_up.length > 0) {
    lines.push("■ 上昇が目立つ品目");
    for (const f of facts.top_yoy_up.slice(0, 3)) lines.push(`・${factLine(f)}`);
  }
  if (facts.top_yoy_down.length > 0) {
    lines.push("■ 下落している品目");
    for (const f of facts.top_yoy_down.slice(0, 3)) lines.push(`・${factLine(f)}`);
  }
  if (facts.streak_up.length > 0) {
    lines.push("■ 連続上昇（3か月以上）");
    for (const f of facts.streak_up.slice(0, 3)) lines.push(`・${factLine(f)}`);
  }
  if (facts.warnings.length > 0) {
    lines.push("■ 注意事項");
    for (const w of facts.warnings) lines.push(`・${w}`);
  }
  return lines.join("\n");
}

export function buildSummaryPrompt(facts: MarketFacts, audience: Audience): { system: string; prompt: string } {
  const system = [
    "あなたは建設資材価格・労務単価・物価指数ダッシュボードの市況解説アシスタントです。",
    "以下のルールを厳守してください:",
    "1. 提供された事実データに含まれる数値のみを使用し、数値を自分で計算・推測しない。",
    "2. データにない事実（原因・将来予測・市場動向の断定）を述べない。",
    "3. 出力は日本語で、見出しなしの簡潔な段落形式（400字以内）。",
    "4. データ不足の警告がある場合は必ず言及する。",
    "5. 対象年月を明記する。",
    AUDIENCE_INSTRUCTIONS[audience],
  ].join("\n");

  const prompt = [
    `対象年月: ${facts.latest_period ?? "不明"}`,
    `対象系列数: ${facts.series_count}`,
    "",
    "前年比上昇トップ:",
    ...facts.top_yoy_up.map((f) => `- ${factLine(f)}`),
    "",
    "前年比下落トップ:",
    ...facts.top_yoy_down.map((f) => `- ${factLine(f)}`),
    "",
    "3か月以上連続上昇:",
    ...facts.streak_up.map((f) => `- ${factLine(f)}`),
    "",
    "3か月以上連続下落:",
    ...facts.streak_down.map((f) => `- ${factLine(f)}`),
    "",
    "警告:",
    ...facts.warnings.map((w) => `- ${w}`),
    "",
    "上記の事実のみに基づいて、今月の市況サマリーを書いてください。",
  ].join("\n");

  return { system, prompt };
}

export async function buildMarketSummary(
  sql: Sql,
  env: Env,
  opts: { regionId?: string; audience?: Audience } = {}
) {
  const audience = opts.audience ?? "default";
  const facts = await collectMarketFacts(sql, { regionId: opts.regionId });
  const providerInfo = getAiProviderInfo(env);
  const fallback = buildFallbackSummary(facts);

  let text = fallback;
  let generatedBy: "ai" | "rule" = "rule";
  let auditStatus = "fallback";
  let errorMessage: string | null = null;
  let durationMs: number | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  if (providerInfo.provider !== "none") {
    try {
      const { system, prompt } = buildSummaryPrompt(facts, audience);
      const result = await generateAiText(env, { system, prompt, maxTokens: 1500 });
      if (result && result.text) {
        text = result.text;
        generatedBy = "ai";
        auditStatus = "success";
        durationMs = result.durationMs;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      auditStatus = "error";
    }
  }

  const auditId = await recordAiAudit(sql, {
    feature: "summary",
    question: `audience=${audience}${opts.regionId ? ` region_id=${opts.regionId}` : ""}`,
    provider: generatedBy === "ai" ? providerInfo.provider : "rule-based",
    model: generatedBy === "ai" ? providerInfo.model : null,
    promptVersion: SUMMARY_PROMPT_VERSION,
    dataScope: { latest_period: facts.latest_period, series_count: facts.series_count, region_id: opts.regionId ?? null },
    responseText: text,
    sources: facts.sources,
    status: auditStatus,
    errorMessage,
    durationMs,
    inputTokens,
    outputTokens,
  });

  return {
    summary: text,
    generated_by: generatedBy,
    provider: generatedBy === "ai" ? providerInfo.provider : "rule-based",
    model: generatedBy === "ai" ? providerInfo.model : null,
    audience,
    audience_label: AUDIENCE_LABELS[audience],
    base_period: facts.latest_period,
    warnings: facts.warnings,
    sources: facts.sources,
    facts: {
      top_yoy_up: facts.top_yoy_up,
      top_yoy_down: facts.top_yoy_down,
      streak_up: facts.streak_up,
      streak_down: facts.streak_down,
      stale_series: facts.stale_series,
    },
    audit_id: auditId,
    disclaimer: "本文章はAI/ルールにより自動生成された参考情報です。積算・契約判断の確定値には使用しないでください。",
  };
}
