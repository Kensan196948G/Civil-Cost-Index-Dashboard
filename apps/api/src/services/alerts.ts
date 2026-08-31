import type { Sql } from "../lib/db";
import { addMonths, detectAlerts } from "../lib/stats";
import { fetchRawRows, groupRawRowsBySeries } from "./timeseries";

const ALERT_DATA_TYPES = ["MATERIAL_PRICE", "LABOR_COST", "PRICE_INDEX", "FUEL_PRICE", "OTHER"];

export async function listAlerts(
  sql: Sql,
  thresholdMom = 5,
  thresholdYoy = 10,
  limit = 20
) {
  const [latest] = await sql`
    SELECT to_char(max(t.period_date), 'YYYY-MM') AS period
    FROM time_series_values t
    JOIN items i ON i.id = t.item_id
    JOIN regions r ON r.id = t.region_id
    JOIN data_sources ds ON ds.id = t.data_source_id
    WHERE i.is_active = true AND r.is_active = true AND ds.is_active = true
      AND t.estimate_usable = true
  `;
  if (!latest?.period) return [];
  const rows = await fetchRawRows(sql, {
    dataType: ALERT_DATA_TYPES[0],
    dataTypes: ALERT_DATA_TYPES,
    startPeriod: addMonths(String(latest.period), -25),
    normalize: false,
  });

  const series = [...groupRawRowsBySeries(rows.filter((row) => row.estimate_usable)).values()].map((list) => ({
    item_name: list[0].item_name,
    region_name: list[0].region_name,
    points: list.map((row) => ({ period: row.period_date, value: Number(row.value) })),
  }));
  return detectAlerts(series, thresholdMom, thresholdYoy, limit);
}
