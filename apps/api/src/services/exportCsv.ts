import type { Sql } from "../lib/db";
import { toCsv } from "../lib/csv";
import { computeRates, normalizeSeries } from "../lib/stats";
import { fetchRawRows, groupRawRowsBySeries, type TimeseriesParams } from "./timeseries";

export async function buildCsvExport(sql: Sql, p: TimeseriesParams): Promise<string> {
  const rows = await fetchRawRows(sql, p);
  const grouped = groupRawRowsBySeries(rows);

  const outputRows: (string | number | null)[][] = [];
  for (const list of grouped.values()) {
    const points = list.map((r) => ({ period: r.period_date, value: Number(r.value) }));
    const rates = computeRates(points);
    const normalized = normalizeSeries(points, p.basePeriod ?? null);
    const useNormalized = p.normalize && normalized.baseRaw != null;
    for (const row of list) {
      const raw = Number(row.value);
      const normValue = normalized.values.get(row.period_date);
      const rate = rates.get(row.period_date);
      outputRows.push([
        row.period_date,
        row.data_type,
        row.item_name,
        row.region_name,
        useNormalized ? (normValue ?? null) : raw,
        useNormalized ? "指数" : (row.unit ?? ""),
        rate?.mom ?? null,
        rate?.yoy ?? null,
        row.value_status,
        row.source_name,
        row.updated_at,
      ]);
    }
  }

  const header = ["年月", "データ分類", "品目", "地域", "値", "単位", "前月比", "前年比", "状態", "出典", "取得日時"];
  return "\uFEFF" + toCsv(header, outputRows);
}
