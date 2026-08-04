import { describe, expect, it } from "vitest";
import { applyRounding, computeEstimate, findBreakdown } from "../src/lib/estimating";

describe("applyRounding", () => {
  it("rounds down to yen by default", () => {
    expect(applyRounding(1234.56, undefined)).toBe(1234);
    expect(applyRounding(1234.56, "yen_down")).toBe(1234);
    expect(applyRounding(1234.56, "yen_round")).toBe(1235);
    expect(applyRounding(1234.56, "yen_up")).toBe(1235);
    expect(applyRounding(1234, "ten_down")).toBe(1230);
    expect(applyRounding(1234, "hundred_up")).toBe(1300);
    expect(applyRounding(1234, "thousand_round")).toBe(1000);
  });
});

describe("findBreakdown", () => {
  const breakdowns = [
    { id: "b1", condition_json: { soil: "clay" }, labor: [], material: [], machinery: [] },
    { id: "b2", condition_json: {}, labor: [], material: [], machinery: [] },
  ];
  it("prefers exact match", () => {
    expect(findBreakdown(breakdowns, { soil: "clay" })?.id).toBe("b1");
  });
  it("falls back to subset match", () => {
    expect(findBreakdown(breakdowns, { soil: "clay", depth: "deep" })?.id).toBe("b1");
  });
  it("falls back to empty-condition breakdown", () => {
    expect(findBreakdown(breakdowns, { soil: "sand" })?.id).toBe("b2");
  });
});

describe("computeEstimate", () => {
  it("computes direct cost, overheads, tax with rounding", () => {
    const result = computeEstimate({
      quantities: [
        {
          tree_id: "t1",
          tree_code: "SOIL_EXCAVATION",
          tree_name: "掘削工",
          unit: "m3",
          quantity: 1000,
          condition_json: { soil: "clay" },
        },
      ],
      breakdownsByTree: new Map([
        [
          "t1",
          [
            {
              id: "b1",
              condition_json: { soil: "clay" },
              labor: [{ name: "普通作業員", unit: "人日", quantity: 0.02, unit_price: 22000 }],
              material: [],
              machinery: [{ name: "バックホウ", unit: "日", quantity: 0.01, unit_price: 45000 }],
            },
          ],
        ],
      ]),
      rates: { common_temp: 0.1, site_management: 0.15, general_management: 0.1 },
      rounding: {
        direct_cost: "yen_down",
        common_temp: "yen_down",
        site_management: "yen_down",
        general_management: "yen_down",
        subtotal: "yen_down",
        tax: "yen_down",
        total: "yen_down",
      },
      taxRate: 0.1,
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].labor_cost).toBe(440000);
    expect(result.lines[0].machinery_cost).toBe(450000);
    expect(result.lines[0].direct_cost).toBe(890000);
    expect(result.direct_cost).toBe(890000);
    expect(result.common_temp_cost).toBe(89000);
    expect(result.site_management_cost).toBe(146850);
    expect(result.general_management_cost).toBe(112585);
    expect(result.subtotal).toBe(1238435);
    expect(result.tax_amount).toBe(123843);
    expect(result.total).toBe(1362278);
    expect(result.materials).toHaveLength(2);
  });

  it("warns when no breakdown exists", () => {
    const result = computeEstimate({
      quantities: [
        {
          tree_id: "t1",
          tree_code: "X",
          tree_name: "不明工種",
          unit: "m3",
          quantity: 100,
          condition_json: {},
        },
      ],
      breakdownsByTree: new Map(),
      rates: { common_temp: 0, site_management: 0, general_management: 0 },
      rounding: {},
    });
    expect(result.warnings.length).toBe(1);
    expect(result.lines[0].direct_cost).toBe(0);
  });
});
