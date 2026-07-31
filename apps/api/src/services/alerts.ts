import type { Sql } from "../lib/db";
import { detectAlerts } from "../lib/stats";
import type { RatePoint } from "../types";

export async function listAlerts(
  sql: Sql,
  thresholdMom = 5,
  thresholdYoy = 10,
  limit = 20
) {
  const rows = await sql`
    SELECT i.item_name, r.region_name,
           to_char(t.period_date, 'YYYY-MM') AS period,
           t.value::text AS value
    FROM time_series_values t
    JOIN items i ON i.id = t.item_id
    JOIN regions r ON r.id = t.region_id
    WHERE i.is_active = true AND r.is_active = true
      AND t.period_date >= (
        SELECT max(period_date) - interval '25 months' FROM time_series_values
      )
    ORDER BY t.period_date ASC
  `;

  const grouped = new Map<string, { item_name: string; region_name: string; points: RatePoint[] }>();
  for (const row of rows) {
    const key = `${row.item_name}:${row.region_name}`;
    const entry = grouped.get(key) ?? {
      item_name: row.item_name,
      region_name: row.region_name,
      points: [] as RatePoint[],
    };
    entry.points.push({ period: String(row.period), value: Number(row.value) });
    grouped.set(key, entry);
  }

  return detectAlerts([...grouped.values()], thresholdMom, thresholdYoy, limit);
}
