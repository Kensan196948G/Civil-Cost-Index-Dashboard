import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Env } from "../types";
import type { Identity } from "../lib/auth";
import { generateAiText } from "../lib/ai";
import { fetchRawRows } from "./timeseries";

export const forecastSchema = z.object({
  item_id: z.string().min(1),
  region_id: z.string().optional().nullable(),
  horizon_months: z.number().int().min(1).max(24).optional(),
});

export async function generateForecast(
  sql: Sql,
  env: Env,
  input: z.infer<typeof forecastSchema> & { identity: Identity }
) {
  const { item_id, region_id, horizon_months = 6, identity } = input;
  const [itemRow] = await sql`
    SELECT id, item_code, item_name, category FROM items WHERE id = ${item_id} AND is_active = true
  `;
  if (!itemRow) {
    const err = new Error("品目が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const rows = await fetchRawRows(sql, {
    dataType: itemRow.category,
    itemIds: [item_id],
    regionIds: region_id ? [region_id] : undefined,
    normalize: false,
  });
  if (rows.length < 3) {
    const err = new Error("予測に十分な時系列データがありません（3件以上必要）。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const sorted = [...rows].sort((a, b) => a.period_date.localeCompare(b.period_date));
  const recent = sorted.slice(-Math.min(24, sorted.length));
  const values = recent.map((r) => Number(r.value));
  const latest = values[values.length - 1];
  const changes: number[] = [];
  for (let i = 1; i < values.length; i++) changes.push(values[i] / values[i - 1] - 1);
  const meanChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  const variance = changes.reduce((a, b) => a + (b - meanChange) ** 2, 0) / Math.max(1, changes.length - 1);
  const stdChange = Math.sqrt(variance);
  const yoy = values.length >= 13 ? values[values.length - 1] / values[values.length - 13] - 1 : null;
  const stats = {
    item_name: recent[recent.length - 1].item_name,
    region_name: recent[recent.length - 1].region_name,
    latest_value: latest,
    latest_period: recent[recent.length - 1].period_date,
    sample_months: values.length,
    mom_avg: meanChange,
    mom_std: stdChange,
    yoy: yoy,
    min_value: Math.min(...values),
    max_value: Math.max(...values),
    horizon_months,
  };
  const base = latest;
  const drift = meanChange * horizon_months;
  const sd = stdChange * Math.sqrt(horizon_months);
  const scenarios = [
    { name: "現状維持", lower: base * (1 + drift - 0.5 * sd), upper: base * (1 + drift + 0.5 * sd) },
    { name: "緩やかな上昇", lower: base * (1 + drift + 0.5 * sd), upper: base * (1 + drift + 1.5 * sd) },
    { name: "急騰", lower: base * (1 + drift + 1.5 * sd), upper: base * (1 + drift + 3 * sd) },
    { name: "下落", lower: base * (1 + drift - 3 * sd), upper: base * (1 + drift - 0.5 * sd) },
  ].map((s) => ({
    name: s.name,
    lower: Math.max(0, Math.round(s.lower * 100) / 100),
    upper: Math.max(0, Math.round(s.upper * 100) / 100),
  }));

  let provider = "rule";
  let model: string | null = null;
  let narrative = "";
  let warnings: string[] = [];
  if (values.length >= 6) {
    try {
      const res = await generateAiText(env, {
        system:
          "あなたは建設コストの予測支援AIです。数値は一切作成せず、コードが計算した統計に基づくシナリオ説明と注意点のみをJSONで返してください。",
        prompt: JSON.stringify({
          task: "以下の統計に基づく予測シナリオの説明を作成してください。",
          stats,
          scenarios,
          output_format: '{"overview":"...","notes":["..."]}',
        }),
      });
      if (res) {
        provider = res.provider;
        model = res.model;
        const parsed = JSON.parse(res.text) as { overview?: string; notes?: string[] };
        narrative = parsed.overview ?? "";
        warnings = Array.isArray(parsed.notes) ? parsed.notes : [];
      }
    } catch {
      warnings = ["AI予測説明の生成に失敗しました。統計値のみを表示します。"];
    }
  } else {
    warnings = ["データが少ないため参考シナリオのみ表示します。"];
  }

  await sql`
    INSERT INTO ai_suggestions
      (suggestion_type, target_type, target_id, content, rationale, provider, model, created_by)
    VALUES
      ('forecast_scenario', 'item', ${item_id},
       ${JSON.stringify({ stats, scenarios, narrative })},
       ${`予測は参考シナリオです。確定値ではありません。`}, ${provider}, ${model}, ${identity.email})
  `;
  return {
    provider,
    model,
    stats,
    scenarios,
    narrative,
    warnings,
    disclaimer: "本予測は参考シナリオであり、確定予測ではありません。計算はコード、AIは説明のみを担当します。",
  };
}
