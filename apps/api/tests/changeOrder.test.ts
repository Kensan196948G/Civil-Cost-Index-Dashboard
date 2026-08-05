import { describe, expect, it } from "vitest";
import { computeChangeLine, summarizeChangeLines } from "../src/lib/changeOrder";

describe("computeChangeLine", () => {
  it("computes quantity and amount diff", () => {
    const line = computeChangeLine({
      tree_code: "SOIL_EXCAVATION",
      tree_name: "掘削工",
      unit: "m3",
      before_quantity: 100,
      after_quantity: 120,
      before_unit_price: 1000,
      after_unit_price: 1100,
    });
    expect(line.quantity_diff).toBe(20);
    expect(line.amount_before).toBe(100000);
    expect(line.amount_after).toBe(132000);
    expect(line.amount_diff).toBe(32000);
  });
});

describe("summarizeChangeLines", () => {
  it("summarizes increase / decrease / net", () => {
    const summary = summarizeChangeLines([
      { ...computeChangeLine({ tree_code: "A", tree_name: "増", unit: "", before_quantity: 1, after_quantity: 2, before_unit_price: 10000, after_unit_price: 30000 }) },
      { ...computeChangeLine({ tree_code: "B", tree_name: "減", unit: "", before_quantity: 3, after_quantity: 1, before_unit_price: 5000, after_unit_price: 5000 }) },
    ]);
    expect(summary.increase).toBe(50000);
    expect(summary.decrease).toBe(-10000);
    expect(summary.net).toBe(40000);
  });
});
