import { describe, expect, it } from "vitest";
import type { RawRow } from "../src/types";
import {
  groupRawRowsBySeries,
  rawRowsToSeries,
  selectPreferredRawSeries,
} from "../src/services/timeseries";

function row(overrides: Partial<RawRow>): RawRow {
  return {
    id: "value-1",
    data_source_id: "source-price",
    data_type: "MATERIAL_PRICE",
    item_id: "item-h",
    item_name: "H形鋼",
    item_code: "STEEL_H",
    data_kind: "actual_price",
    estimate_usable: true,
    region_id: "region-national",
    region_name: "全国",
    region_code: "JP-01",
    period_date: "2026-06",
    value: "90000",
    unit: "円/t",
    value_status: "confirmed",
    note: null,
    source_code: "PRICE_ACTUAL",
    source_name: "実単価統計",
    source_url: null,
    license_note: null,
    redistribution_note: null,
    source_file_id: null,
    updated_at: "2026-07-01T00:00:00+00:00",
    ...overrides,
  };
}

describe("time-series source isolation", () => {
  const rows = [
    row({ id: "price-1", period_date: "2026-05", value: "89000" }),
    row({ id: "price-2", period_date: "2026-06", value: "90000" }),
    row({
      id: "trend-1",
      data_source_id: "source-trend",
      source_code: "ESTAT_MATERIAL_SUPPLY",
      source_name: "主要建設資材需給・価格動向調査",
      data_kind: "trend_assessment",
      estimate_usable: false,
      period_date: "2026-07",
      value: "3.67",
      unit: "動向評価値",
    }),
  ];

  it("separates rows by source, unit, and data governance", () => {
    const grouped = groupRawRowsBySeries(rows);
    expect(grouped.size).toBe(2);

    const series = rawRowsToSeries(rows, { normalize: false, basePeriod: null });
    expect(series).toHaveLength(2);
    const actual = series.find((entry) => entry.source_code === "PRICE_ACTUAL")!;
    const trend = series.find((entry) => entry.source_code === "ESTAT_MATERIAL_SUPPLY")!;
    expect(actual).toMatchObject({ unit: "円/t", data_kind: "actual_price", estimate_usable: true });
    expect(actual.points.map((point) => point.raw_value)).toEqual([89000, 90000]);
    expect(trend).toMatchObject({ unit: "動向評価値", data_kind: "trend_assessment", estimate_usable: false });
    expect(trend.points.map((point) => point.raw_value)).toEqual([3.67]);
    expect(actual.series_id).not.toBe(trend.series_id);
    expect(actual.label).toContain("実単価統計");
    expect(trend.label).toContain("主要建設資材需給・価格動向調査");
  });

  it("prefers an estimate-usable coherent series for calculations", () => {
    const selected = selectPreferredRawSeries(rows);
    expect(selected).toHaveLength(2);
    expect(selected.every((entry) => entry.source_code === "PRICE_ACTUAL")).toBe(true);
  });

  it("prefers national and non-sample series deterministically", () => {
    const candidates = [
      row({ data_source_id: "sample", source_code: "SAMPLE_MATERIAL", source_name: "サンプル", period_date: "2026-08" }),
      row({ data_source_id: "regional", source_code: "OFFICIAL_REGIONAL", region_id: "tokyo", region_code: "JP-PREF-13", region_name: "東京都" }),
      row({ data_source_id: "official", source_code: "OFFICIAL_NATIONAL", source_name: "公式全国" }),
    ];
    expect(selectPreferredRawSeries(candidates)[0].source_code).toBe("OFFICIAL_NATIONAL");
  });
});
