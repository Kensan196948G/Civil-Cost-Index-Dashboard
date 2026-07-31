import type { Sql } from "../lib/db";
import { computeRates, normalizeSeries } from "../lib/stats";
import { listAlerts } from "./alerts";

const KPI_DEFS = [
  { category: "MATERIAL_PRICE", name: "鋼材価格", item_code: "STEEL_H" },
  { category: "LABOR_COST", name: "労務単価", item_code: "LABOR_COMMON" },
  { category: "PRICE_INDEX", name: "物価指数", item_code: "INDEX_CONSTRUCTION" },
] as const;

export async function getDashboardSummary(
  sql: Sql,
  opts: { regionId?: string; basePeriod?: string | null; period?: string }
) {
  const [latest] = await sql`
    SELECT to_char(max(period_date), 'YYYY-MM') AS period FROM time_series_values
  `;
  const [lastUpdated] = await sql`
    SELECT to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF') AS at
    FROM time_series_values
  `;

  const kpis = [];
  for (const def of KPI_DEFS) {
    const conditions = ["i.item_code = $1", "i.category = $2"];
    const params: unknown[] = [def.item_code, def.category];
    if (opts.regionId) {
      params.push(opts.regionId);
      conditions.push(`t.region_id = $${params.length}`);
    }
    if (opts.period === "1y") {
      conditions.push(`t.period_date >= (SELECT max(period_date) - interval '13 months' FROM time_series_values)`);
    } else if (opts.period === "3y") {
      conditions.push(`t.period_date >= (SELECT max(period_date) - interval '37 months' FROM time_series_values)`);
    } else if (opts.period === "5y") {
      conditions.push(`t.period_date >= (SELECT max(period_date) - interval '61 months' FROM time_series_values)`);
    }
    const rows = await sql(
      `
      SELECT i.item_name, i.default_unit, r.region_name,
             to_char(t.period_date, 'YYYY-MM') AS period,
             t.value::text AS value
      FROM time_series_values t
      JOIN items i ON i.id = t.item_id
      JOIN regions r ON r.id = t.region_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY t.period_date ASC
      `,
      params
    );
    if (rows.length === 0) {
      kpis.push({
        name: def.name,
        value: null,
        unit: "",
        period: null,
        mom_rate: null,
        yoy_rate: null,
      });
      continue;
    }
    const points = rows.map((r) => ({ period: r.period, value: Number(r.value) }));
    const rates = computeRates(points);
    const lastPoint = points[points.length - 1];
    const rate = rates.get(lastPoint.period);
    const normalized = normalizeSeries(points, opts.basePeriod ?? null);
    const isIndex = def.category === "PRICE_INDEX";
    kpis.push({
      name: def.name,
      value: isIndex ? (normalized.baseRaw != null ? normalized.values.get(lastPoint.period) : lastPoint.value) : lastPoint.value,
      unit: isIndex ? "指数" : (rows[0].default_unit ?? ""),
      period: lastPoint.period,
      mom_rate: rate?.mom ?? null,
      yoy_rate: rate?.yoy ?? null,
    });
  }

  const alerts = await listAlerts(sql, 5, 10, 5);

  const sources = await sql`
    SELECT source_name, last_fetched_at FROM data_sources
    WHERE is_active = true
    ORDER BY last_fetched_at DESC NULLS LAST, source_code
    LIMIT 10
  `;
  const updateStatus = sources.map((s) => ({
    data_source_name: s.source_name,
    last_fetched_at: s.last_fetched_at,
    status: s.last_fetched_at ? "success" : "not_fetched",
  }));

  return {
    latest_period: latest?.period ?? null,
    last_updated_at: lastUpdated?.at ?? null,
    kpis,
    alerts,
    update_status: updateStatus,
  };
}
