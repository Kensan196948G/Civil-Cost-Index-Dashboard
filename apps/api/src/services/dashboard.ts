import type { Sql } from "../lib/db";
import { addMonths, computeRates, normalizeSeries } from "../lib/stats";
import { listAlerts } from "./alerts";
import { fetchRawRows, selectPreferredRawSeries } from "./timeseries";

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
    const candidates = await fetchRawRows(sql, {
      dataType: def.category,
      itemCodes: [def.item_code],
      regionIds: opts.regionId ? [opts.regionId] : undefined,
      normalize: false,
    });
    let rows = selectPreferredRawSeries(candidates.filter((row) => row.estimate_usable));
    const rangeMonths = opts.period === "1y" ? 13 : opts.period === "3y" ? 37 : opts.period === "5y" ? 61 : null;
    if (rangeMonths && rows.length > 0) {
      const latestPeriod = rows.reduce((max, row) => row.period_date > max ? row.period_date : max, "");
      const cutoff = addMonths(latestPeriod, -rangeMonths);
      rows = rows.filter((row) => row.period_date >= cutoff);
    }
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
    const points = rows.map((r) => ({ period: r.period_date, value: Number(r.value) }));
    const rates = computeRates(points);
    const lastPoint = points[points.length - 1];
    const rate = rates.get(lastPoint.period);
    const normalized = normalizeSeries(points, opts.basePeriod ?? null);
    const isIndex = def.category === "PRICE_INDEX";
    kpis.push({
      name: def.name,
      value: isIndex ? (normalized.baseRaw != null ? normalized.values.get(lastPoint.period) : lastPoint.value) : lastPoint.value,
      unit: isIndex ? "指数" : (rows[0].unit ?? ""),
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
