import { describe, expect, it } from "vitest";
import { compareQuoteItems, quoteExpiryStatus } from "../src/lib/quotations";

describe("compareQuoteItems", () => {
  it("computes average, deviation and warns on ±20%", () => {
    const rows = compareQuoteItems([
      { key: "item:STEEL_H", item_name: "H形鋼", standard_name: "SS400", unit: "円/t", unit_price: 1000, supplier_name: "A社", quote_date: "2026-08-01" },
      { key: "item:STEEL_H", item_name: "H形鋼", standard_name: "SS400", unit: "円/t", unit_price: 1300, supplier_name: "B社", quote_date: "2026-08-01" },
      { key: "item:STEEL_H", item_name: "H形鋼", standard_name: "SS400", unit: "円/t", unit_price: 2000, supplier_name: "C社", quote_date: "2026-08-01" },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].average).toBeCloseTo(1433.33, 1);
    expect(rows.find((r) => r.supplier_name === "C社")?.warnings.length).toBeGreaterThan(0);
    expect(rows.find((r) => r.supplier_name === "A社")?.warnings.length).toBeGreaterThan(0);
  });

  it("computes previous price change", () => {
    const rows = compareQuoteItems(
      [
        { key: "item:STEEL_H", item_name: "H形鋼", standard_name: null, unit: "円/t", unit_price: 1100, supplier_name: "A社", quote_date: "2026-08-01" },
      ],
      new Map([["A社|item:STEEL_H", 1000]])
    );
    expect(rows[0].previous_price).toBe(1000);
    expect(rows[0].previous_change_rate).toBe(10);
  });
});

describe("quoteExpiryStatus", () => {
  it("flags expired / expiring / none", () => {
    expect(quoteExpiryStatus("2026-07-01", new Date("2026-08-01")).expired).toBe(true);
    expect(quoteExpiryStatus("2026-08-20", new Date("2026-08-01")).expiring_soon).toBe(true);
    expect(quoteExpiryStatus(null, new Date("2026-08-01")).days_left).toBeNull();
  });
});
