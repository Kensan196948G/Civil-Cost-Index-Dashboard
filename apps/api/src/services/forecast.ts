import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Env } from "../types";
import type { Identity } from "../lib/auth";
import { generateAiText } from "../lib/ai";
import { fetchRawRows, selectPreferredRawSeries } from "./timeseries";

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
  const selectedRows = selectPreferredRawSeries(rows.filter((row) => row.estimate_usable));
  if (selectedRows.length < 3) {
    const err = new Error("予測に十分な時系列データがありません（3件以上必要）。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const sorted = [...selectedRows].sort((a, b) => a.period_date.localeCompare(b.period_date));
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
    source_name: recent[recent.length - 1].source_name,
    source_code: recent[recent.length - 1].source_code,
    data_kind: recent[recent.length - 1].data_kind,
    unit: recent[recent.length - 1].unit,
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
      }, "forecast");
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
  const statusScenario = scenarios.find((s) => s.name === "現状維持");
  const forecastValue = statusScenario ? (statusScenario.lower + statusScenario.upper) / 2 : latest;
  await sql`
    INSERT INTO forecast_evaluations
      (item_id, item_name, forecast_date, horizon_months, forecast_value,
       forecast_lower, forecast_upper, sample_months, status)
    VALUES
      (${item_id}, ${stats.item_name}, ${new Date().toISOString().slice(0, 10)}::date,
       ${horizon_months}, ${forecastValue},
       ${statusScenario?.lower ?? null}, ${statusScenario?.upper ?? null},
       ${stats.sample_months}, 'pending')
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

export async function evaluateForecast(
  sql: Sql,
  input: { item_id: string; actual_value: number; actual_period: string }
): Promise<{
  id: string;
  forecast_value: number;
  actual_value: number;
  error_rate: number | null;
  horizon_months: number;
  forecast_date: string;
} | null> {
  const rows = (await sql`
    SELECT id, forecast_value, horizon_months FROM forecast_evaluations
    WHERE item_id = ${input.item_id} AND status = 'pending'
    ORDER BY forecast_date DESC, created_at DESC
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  const evalRow = rows[0];
  const forecast = Number(evalRow.forecast_value);
  const errorRate = forecast !== 0 ? (input.actual_value - forecast) / forecast : null;
  const [row] = (await sql`
    UPDATE forecast_evaluations SET
      actual_value = ${input.actual_value},
      actual_period = ${input.actual_period},
      error_rate = ${errorRate},
      status = 'evaluated'
    WHERE id = ${evalRow.id}
    RETURNING id, forecast_value, actual_value, error_rate, horizon_months, forecast_date
  `) as Array<Record<string, unknown>>;
  return {
    id: String(row.id),
    forecast_value: Number(row.forecast_value),
    actual_value: Number(row.actual_value),
    error_rate: row.error_rate != null ? Number(row.error_rate) : null,
    horizon_months: Number(row.horizon_months),
    forecast_date: String(row.forecast_date),
  };
}

export async function listForecastEvaluations(sql: Sql, itemId?: string) {
  const rows = (itemId
    ? await sql`
        SELECT id, item_id, item_name, forecast_date, horizon_months,
               forecast_value, forecast_lower, forecast_upper, actual_value,
               actual_period, error_rate, sample_months, status,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
        FROM forecast_evaluations
        WHERE item_id = ${itemId}
        ORDER BY forecast_date DESC, created_at DESC
      `
    : await sql`
        SELECT id, item_id, item_name, forecast_date, horizon_months,
               forecast_value, forecast_lower, forecast_upper, actual_value,
               actual_period, error_rate, sample_months, status,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
        FROM forecast_evaluations
        ORDER BY forecast_date DESC, created_at DESC
      `) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    ...r,
    forecast_value: Number(r.forecast_value),
    forecast_lower: r.forecast_lower != null ? Number(r.forecast_lower) : null,
    forecast_upper: r.forecast_upper != null ? Number(r.forecast_upper) : null,
    actual_value: r.actual_value != null ? Number(r.actual_value) : null,
    error_rate: r.error_rate != null ? Number(r.error_rate) : null,
    sample_months: r.sample_months != null ? Number(r.sample_months) : null,
  }));
}
