import type { Sql } from "../lib/db";
import { computeRates, round2 } from "../lib/stats";
import type { RatePoint } from "../types";
import { monthsBetween } from "./aiFacts";

/**
 * AIデータ品質支援（Phase 1はルール・統計ベース）。
 * 異常＝誤りではなく「確認候補」として提示する。自動確定は行わない。
 */

export type QualityIssue = {
  type: "stale" | "gap" | "constant" | "outlier" | "name_variant";
  severity: "high" | "medium" | "low";
  item_name: string;
  region_name: string | null;
  detail: string;
};

export type SeriesQualityInput = {
  item_name: string;
  region_name: string;
  points: RatePoint[];
};

/** 品目名の表記揺れ判定用の正規化（空白・全半角・記号差を吸収） */
export function normalizeItemName(name: string): string {
  return name
    .replace(/[\s\u3000]+/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[（）()「」『』・,、．.-]/g, "")
    .toLowerCase();
}

const NAME_SYNONYMS: Array<[RegExp, string]> = [
  [/異形棒鋼|鉄筋/g, "鉄筋"],
  [/生コンクリート|生コン|レディーミクストコンクリート/g, "生コン"],
];

export function canonicalItemKey(name: string): string {
  let s = normalizeItemName(name);
  for (const [re, rep] of NAME_SYNONYMS) s = s.replace(re, rep);
  return s;
}

export function findNameVariantCandidates(items: Array<{ item_name: string }>): QualityIssue[] {
  const byKey = new Map<string, string[]>();
  for (const it of items) {
    const key = canonicalItemKey(it.item_name);
    const arr = byKey.get(key) ?? [];
    if (!arr.includes(it.item_name)) arr.push(it.item_name);
    byKey.set(key, arr);
  }
  const issues: QualityIssue[] = [];
  for (const names of byKey.values()) {
    if (names.length >= 2) {
      issues.push({
        type: "name_variant",
        severity: "medium",
        item_name: names.join(" / "),
        region_name: null,
        detail: `「${names.join("」と「")}」は同一品目の表記揺れ候補です。統合を検討してください（自動統合はされません）。`,
      });
    }
  }
  return issues;
}

export function checkSeriesQuality(series: SeriesQualityInput, globalLatest: string | null): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const sorted = [...series.points].sort((a, b) => a.period.localeCompare(b.period));
  if (sorted.length === 0) return issues;
  const last = sorted[sorted.length - 1];

  // 1. 更新遅延
  if (globalLatest) {
    const behind = monthsBetween(last.period, globalLatest);
    if (behind >= 3) {
      issues.push({
        type: "stale",
        severity: behind >= 6 ? "high" : "medium",
        item_name: series.item_name,
        region_name: series.region_name,
        detail: `最新データが${last.period}のまま${behind}か月更新されていません。`,
      });
    }
  }

  // 2. 欠損月
  const first = sorted[0];
  const span = monthsBetween(first.period, last.period) + 1;
  const missing = span - sorted.length;
  if (missing > 0) {
    issues.push({
      type: "gap",
      severity: missing >= 3 ? "medium" : "low",
      item_name: series.item_name,
      region_name: series.region_name,
      detail: `${first.period}〜${last.period}の期間に${missing}か月分の欠損があります。`,
    });
  }

  // 3. 長期間同値（不自然な固定値）
  let constantRun = 1;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i].value === sorted[i - 1].value) constantRun++;
    else break;
  }
  if (constantRun >= 6) {
    issues.push({
      type: "constant",
      severity: "low",
      item_name: series.item_name,
      region_name: series.region_name,
      detail: `直近${constantRun}か月間、値が${last.value.toLocaleString("ja-JP")}のまま変化していません。転記漏れ・未改定の可能性があります。`,
    });
  }

  // 4. 統計的外れ値（直近の前月比が過去分布から大きく乖離: Zスコア）
  const rates = computeRates(sorted);
  const momHistory = sorted
    .slice(0, -1)
    .map((p) => rates.get(p.period)?.mom)
    .filter((v): v is number => v != null);
  const lastMom = rates.get(last.period)?.mom;
  if (lastMom != null && momHistory.length >= 6) {
    const mean = momHistory.reduce((a, b) => a + b, 0) / momHistory.length;
    const variance = momHistory.reduce((a, b) => a + (b - mean) ** 2, 0) / momHistory.length;
    const sd = Math.sqrt(variance);
    if (sd > 0) {
      const z = (lastMom - mean) / sd;
      if (Math.abs(z) >= 3) {
        issues.push({
          type: "outlier",
          severity: "high",
          item_name: series.item_name,
          region_name: series.region_name,
          detail: `直近の前月比${lastMom > 0 ? "+" : ""}${lastMom}%は過去平均（${round2(mean)}%）からZスコア${round2(z)}の乖離があります。桁誤り・単位違いを確認してください。`,
        });
      }
    }
  }

  return issues;
}

export type QualityScore = {
  source_name: string;
  score: number;
  breakdown: { completeness: number; freshness: number; consistency: number };
  note: string;
};

export function computeQualityScore(input: {
  source_name: string;
  seriesCount: number;
  staleCount: number;
  gapCount: number;
  outlierCount: number;
  constantCount: number;
}): QualityScore {
  const n = Math.max(input.seriesCount, 1);
  const freshness = Math.max(0, 100 - Math.round((input.staleCount / n) * 100));
  const completeness = Math.max(0, 100 - Math.round((input.gapCount / n) * 60));
  const consistency = Math.max(0, 100 - Math.round(((input.outlierCount + input.constantCount) / n) * 80));
  const score = Math.round(freshness * 0.4 + completeness * 0.3 + consistency * 0.3);
  const notes: string[] = [];
  if (freshness < 100) notes.push("最新月の未更新により最新性を減点");
  if (completeness < 100) notes.push("欠損月あり");
  if (consistency < 100) notes.push("外れ値・固定値候補あり");
  return {
    source_name: input.source_name,
    score,
    breakdown: { completeness, freshness, consistency },
    note: notes.length > 0 ? notes.join("。") + "。" : "大きな品質問題は検出されていません。",
  };
}

export async function runQualityChecks(sql: Sql) {
  const rows = await sql`
    SELECT i.item_name, r.region_name, ds.source_name,
           to_char(t.period_date, 'YYYY-MM') AS period,
           t.value::text AS value
    FROM time_series_values t
    JOIN items i ON i.id = t.item_id
    JOIN regions r ON r.id = t.region_id
    LEFT JOIN data_sources ds ON ds.id = t.data_source_id
    WHERE i.is_active = true AND r.is_active = true
    ORDER BY t.period_date ASC
  `;

  const [latest] = await sql`SELECT to_char(max(period_date), 'YYYY-MM') AS period FROM time_series_values`;
  const globalLatest = latest?.period ? String(latest.period) : null;

  const grouped = new Map<string, SeriesQualityInput & { source_name: string }>();
  for (const row of rows) {
    const key = `${row.item_name}:${row.region_name}`;
    const entry =
      grouped.get(key) ??
      ({
        item_name: String(row.item_name),
        region_name: String(row.region_name),
        source_name: row.source_name == null ? "不明" : String(row.source_name),
        points: [],
      } as SeriesQualityInput & { source_name: string });
    entry.points.push({ period: String(row.period), value: Number(row.value) });
    grouped.set(key, entry);
  }

  const issues: QualityIssue[] = [];
  const bySource = new Map<string, { seriesCount: number; stale: number; gap: number; outlier: number; constant: number }>();
  for (const series of grouped.values()) {
    const seriesIssues = checkSeriesQuality(series, globalLatest);
    issues.push(...seriesIssues);
    const agg = bySource.get(series.source_name) ?? { seriesCount: 0, stale: 0, gap: 0, outlier: 0, constant: 0 };
    agg.seriesCount++;
    for (const issue of seriesIssues) {
      if (issue.type === "stale") agg.stale++;
      if (issue.type === "gap") agg.gap++;
      if (issue.type === "outlier") agg.outlier++;
      if (issue.type === "constant") agg.constant++;
    }
    bySource.set(series.source_name, agg);
  }

  const items = await sql`SELECT item_name FROM items WHERE is_active = true`;
  issues.push(...findNameVariantCandidates(items.map((i) => ({ item_name: String(i.item_name) }))));

  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const scores = [...bySource.entries()].map(([source_name, agg]) =>
    computeQualityScore({
      source_name,
      seriesCount: agg.seriesCount,
      staleCount: agg.stale,
      gapCount: agg.gap,
      outlierCount: agg.outlier,
      constantCount: agg.constant,
    })
  );

  return {
    checked_series: grouped.size,
    latest_period: globalLatest,
    issues,
    quality_scores: scores.sort((a, b) => a.score - b.score),
    note: "検出結果は「確認候補」です。異常＝誤りではありません。修正・統合は管理者の承認操作でのみ行われます。",
  };
}
