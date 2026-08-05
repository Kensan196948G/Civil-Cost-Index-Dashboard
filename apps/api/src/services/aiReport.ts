import type { Sql } from "../lib/db";
import type { Env } from "../types";
import { generateAiText, getAiProviderInfo } from "../lib/ai";
import { collectMarketFacts, type MarketFacts, type SeriesFact } from "./aiFacts";
import { type Audience, buildFallbackSummary } from "./aiSummary";
import { recordAiAudit } from "./aiAudit";

export const REPORT_PROMPT_VERSION = "report-v1";

export type ReportType = "monthly" | "executive" | "estimator" | "client" | "quality";

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  monthly: "月次市況レポート",
  executive: "経営会議向け1ページ要約",
  estimator: "積算担当者向け詳細分析",
  client: "発注者向け説明資料",
  quality: "データ品質レポート",
};

const REPORT_AUDIENCE: Record<ReportType, Audience> = {
  monthly: "default",
  executive: "executive",
  estimator: "estimator",
  client: "client",
  quality: "default",
};

function rateCell(rate: number | null): string {
  if (rate == null) return "―";
  return `${rate > 0 ? "+" : ""}${rate}%`;
}

function factsTable(facts: SeriesFact[]): string {
  if (facts.length === 0) return "（該当データなし）";
  const header = "| 品目 | 地域 | 対象年月 | 値 | 前月比 | 前年比 | 連続 |\n| --- | --- | --- | ---: | ---: | ---: | --- |";
  const rows = facts.map(
    (f) =>
      `| ${f.item_name} | ${f.region_name} | ${f.latest_period} | ${f.latest_value.toLocaleString("ja-JP")}${f.unit ? ` ${f.unit}` : ""} | ${rateCell(f.mom_rate)} | ${rateCell(f.yoy_rate)} | ${f.streak >= 3 ? `${f.streak}か月連続上昇` : f.streak <= -3 ? `${-f.streak}か月連続下落` : "―"} |`
  );
  return [header, ...rows].join("\n");
}

/** レポートの骨格（データ表・出典・免責）はすべてコードで生成する。AIは所見の文章のみ担当。 */
export function buildReportSkeleton(
  facts: MarketFacts,
  reportType: ReportType,
  narrative: string,
  meta: { generatedBy: "ai" | "rule"; provider: string; model: string | null; generatedAt: string }
): string {
  const lines: string[] = [];
  lines.push(`# ${REPORT_TYPE_LABELS[reportType]}`);
  lines.push("");
  lines.push(`- 対象年月: ${facts.latest_period ?? "不明"}`);
  lines.push(`- 対象系列数: ${facts.series_count}`);
  lines.push(`- 生成日時: ${meta.generatedAt}`);
  lines.push(`- 生成方式: ${meta.generatedBy === "ai" ? `AI生成（${meta.provider}${meta.model ? ` / ${meta.model}` : ""}）` : "ルール生成"}`);
  lines.push("");
  lines.push("## 所見");
  lines.push("");
  lines.push(narrative);
  lines.push("");
  lines.push("## 前年比上昇トップ");
  lines.push("");
  lines.push(factsTable(facts.top_yoy_up));
  lines.push("");
  lines.push("## 前年比下落トップ");
  lines.push("");
  lines.push(factsTable(facts.top_yoy_down));
  lines.push("");
  lines.push("## 連続変動（3か月以上）");
  lines.push("");
  lines.push(factsTable([...facts.streak_up, ...facts.streak_down]));
  if (facts.stale_series.length > 0) {
    lines.push("");
    lines.push("## データ更新遅延");
    lines.push("");
    lines.push("| 品目 | 地域 | 最新データ | 遅延 |");
    lines.push("| --- | --- | --- | --- |");
    for (const s of facts.stale_series) {
      lines.push(`| ${s.item_name} | ${s.region_name} | ${s.latest_period} | ${s.months_behind}か月 |`);
    }
  }
  if (facts.warnings.length > 0) {
    lines.push("");
    lines.push("## 注意事項");
    lines.push("");
    for (const w of facts.warnings) lines.push(`- ${w}`);
  }
  lines.push("");
  lines.push("## 出典");
  lines.push("");
  if (facts.sources.length === 0) {
    lines.push("- （データソース情報なし）");
  } else {
    for (const s of facts.sources) {
      lines.push(`- ${s.source_name}${s.last_fetched_at ? `（最終取込: ${s.last_fetched_at.slice(0, 10)}）` : ""}`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "*本レポートは自動生成された参考情報です。数値はシステムの統計処理による確定値ですが、所見の文章は自動生成のため、積算・契約判断には原典の確認を推奨します。*"
  );
  return lines.join("\n");
}

export function buildReportNarrativePrompt(facts: MarketFacts, reportType: ReportType): { system: string; prompt: string } {
  const audience = REPORT_AUDIENCE[reportType];
  const system = [
    `あなたは建設コストダッシュボードのレポート作成アシスタントです。「${REPORT_TYPE_LABELS[reportType]}」の所見セクションのみを書きます。`,
    "ルール:",
    "1. 提供された数値のみを使用し、計算・推測をしない。",
    "2. 原因の断定・将来予測をしない。データにあることだけを述べる。",
    "3. 日本語の段落形式で3〜6文。見出しや箇条書きは不要。",
    audience === "executive" ? "経営層向けに簡潔・平易に。" : "",
    audience === "estimator" ? "積算担当者向けに、概算原価への影響確認が必要な資材を具体的に。" : "",
    audience === "client" ? "発注者向けに丁寧で慎重な表現で。" : "",
  ]
    .filter(Boolean)
    .join("\n");
  const factLines = [
    `対象年月: ${facts.latest_period ?? "不明"}`,
    "上昇: " + facts.top_yoy_up.map((f) => `${f.item_name}(${f.region_name}) 前年比${rateCell(f.yoy_rate)}`).join(" / "),
    "下落: " + facts.top_yoy_down.map((f) => `${f.item_name}(${f.region_name}) 前年比${rateCell(f.yoy_rate)}`).join(" / "),
    "連続上昇: " + facts.streak_up.map((f) => `${f.item_name}(${f.region_name}) ${f.streak}か月`).join(" / "),
    "警告: " + facts.warnings.join(" / "),
  ];
  return { system, prompt: factLines.join("\n") };
}

export async function generateReport(
  sql: Sql,
  env: Env,
  opts: { reportType: ReportType; regionId?: string }
) {
  const facts = await collectMarketFacts(sql, { regionId: opts.regionId });
  const providerInfo = getAiProviderInfo(env);
  const generatedAt = new Date().toISOString();

  let narrative = buildFallbackSummary(facts);
  let generatedBy: "ai" | "rule" = "rule";
  let auditStatus = "fallback";
  let errorMessage: string | null = null;

  if (providerInfo.provider !== "none") {
    try {
      const { system, prompt } = buildReportNarrativePrompt(facts, opts.reportType);
      const result = await generateAiText(env, { system, prompt, maxTokens: 1500 }, "report");
      if (result && result.text) {
        narrative = result.text;
        generatedBy = "ai";
        auditStatus = "success";
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      auditStatus = "error";
    }
  }

  const markdown = buildReportSkeleton(facts, opts.reportType, narrative, {
    generatedBy,
    provider: providerInfo.provider,
    model: providerInfo.model,
    generatedAt,
  });

  const auditId = await recordAiAudit(sql, {
    feature: "report",
    question: `report_type=${opts.reportType}${opts.regionId ? ` region_id=${opts.regionId}` : ""}`,
    provider: generatedBy === "ai" ? providerInfo.provider : "rule-based",
    model: generatedBy === "ai" ? providerInfo.model : null,
    promptVersion: REPORT_PROMPT_VERSION,
    dataScope: { latest_period: facts.latest_period, series_count: facts.series_count },
    responseText: narrative,
    sources: facts.sources,
    status: auditStatus,
    errorMessage,
  });

  return {
    report_type: opts.reportType,
    report_type_label: REPORT_TYPE_LABELS[opts.reportType],
    markdown,
    generated_by: generatedBy,
    provider: generatedBy === "ai" ? providerInfo.provider : "rule-based",
    model: generatedBy === "ai" ? providerInfo.model : null,
    generated_at: generatedAt,
    base_period: facts.latest_period,
    audit_id: auditId,
  };
}
