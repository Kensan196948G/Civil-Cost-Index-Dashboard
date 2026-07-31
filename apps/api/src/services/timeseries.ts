import type { Sql } from "../lib/db";
import { computeRates, normalizeSeries, periodToDate } from "../lib/stats";
import type { RawRow, Series, TimeseriesConditions } from "../types";

export type TimeseriesParams = {
  dataType: string;
  dataTypes?: string[];
  itemIds?: string[];
  regionIds?: string[];
  itemCodes?: string[];
  regionCodes?: string[];
  startPeriod?: string | null;
  endPeriod?: string | null;
  normalize: boolean;
  basePeriod?: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL_PRICE: "資材価格",
  LABOR_COST: "労務単価",
  PRICE_INDEX: "物価指数",
  FUEL_PRICE: "燃料価格",
  OTHER: "その他",
};

export async function fetchRawRows(sql: Sql, p: TimeseriesParams): Promise<RawRow[]> {
  const conditions: string[] = ["i.is_active = true", "r.is_active = true", "ds.is_active = true"];
  const params: unknown[] = [];
  if (p.dataTypes?.length) {
    params.push(p.dataTypes);
    conditions.push(`t.data_type = ANY($${params.length})`);
  } else {
    params.push(p.dataType);
    conditions.push(`t.data_type = $${params.length}`);
  }
  if (p.itemIds?.length) {
    params.push(p.itemIds);
    conditions.push(`t.item_id = ANY($${params.length})`);
  }
  if (p.regionIds?.length) {
    params.push(p.regionIds);
    conditions.push(`t.region_id = ANY($${params.length})`);
  }
  if (p.itemCodes?.length) {
    params.push(p.itemCodes);
    conditions.push(`i.item_code = ANY($${params.length})`);
  }
  if (p.regionCodes?.length) {
    params.push(p.regionCodes);
    conditions.push(`r.region_code = ANY($${params.length})`);
  }
  if (p.startPeriod) {
    params.push(periodToDate(p.startPeriod));
    conditions.push(`t.period_date >= $${params.length}::date`);
  }
  if (p.endPeriod) {
    params.push(periodToDate(p.endPeriod));
    conditions.push(`t.period_date <= $${params.length}::date`);
  }

  const rows = await sql(
    `
      SELECT t.id, t.data_source_id, t.data_type, t.item_id, i.item_name, i.item_code,
             t.region_id, r.region_name, r.region_code,
             to_char(t.period_date, 'YYYY-MM') AS period_date,
             t.value::text AS value, t.unit, t.value_status, t.note,
             ds.source_name, ds.source_url, t.source_file_id,
             to_char(t.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
      FROM time_series_values t
      JOIN items i ON i.id = t.item_id
      JOIN regions r ON r.id = t.region_id
      JOIN data_sources ds ON ds.id = t.data_source_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY t.period_date ASC
    `,
    params
  );
  return rows as unknown as RawRow[];
}

export function rawRowsToSeries(
  rows: RawRow[],
  p: Pick<TimeseriesParams, "normalize" | "basePeriod">
): Series[] {
  const grouped = new Map<string, RawRow[]>();
  for (const row of rows) {
    const key = `${row.item_id}:${row.region_id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const series: Series[] = [];
  for (const list of grouped.values()) {
    const first = list[0];
    const points = list.map((r) => ({ period: r.period_date, value: Number(r.value) }));
    const rates = computeRates(points);
    const normalized = normalizeSeries(points, p.basePeriod ?? null);
    const useNormalized = p.normalize && normalized.baseRaw != null;
    const sorted = [...list].sort((a, b) => a.period_date.localeCompare(b.period_date));
    series.push({
      series_id: `${first.data_type}:${first.item_code}:${first.region_code}`,
      label: `${first.item_name}｜${first.region_name}`,
      unit: useNormalized ? "index" : (first.unit ?? ""),
      source_name: first.source_name,
      source_url: first.source_url,
      points: sorted.map((r) => {
        const raw = Number(r.value);
        const normalizedValue = normalized.values.get(r.period_date);
        const rate = rates.get(r.period_date);
        return {
          period: r.period_date,
          value: useNormalized ? (normalizedValue ?? null) : raw,
          raw_value: raw,
          mom_rate: rate?.mom ?? null,
          yoy_rate: rate?.yoy ?? null,
          status: r.value_status,
        };
      }),
    });
  }
  return series.sort((a, b) => a.series_id.localeCompare(b.series_id));
}

export async function buildTimeseries(
  sql: Sql,
  p: TimeseriesParams
): Promise<{ conditions: TimeseriesConditions; series: Series[] }> {
  const rows = await fetchRawRows(sql, p);
  const series = rawRowsToSeries(rows, p);
  return {
    conditions: {
      data_type: p.dataType,
      start_period: p.startPeriod ?? null,
      end_period: p.endPeriod ?? null,
      normalize: p.normalize,
      base_period: p.basePeriod ?? null,
    },
    series,
  };
}

export { CATEGORY_LABELS };
