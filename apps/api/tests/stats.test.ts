import { describe, expect, it } from "vitest";
import {
  addMonths,
  computeRates,
  detectAlerts,
  normalizeSeries,
  parseNumeric,
  parsePeriod,
  round2,
} from "../src/lib/stats";

describe("parsePeriod", () => {
  it("parses YYYY-MM / YYYY/MM / 和暦", () => {
    expect(parsePeriod("2025-04")).toBe("2025-04");
    expect(parsePeriod("2025/4")).toBe("2025-04");
    expect(parsePeriod("令和6年4月")).toBe("2024-04");
    expect(parsePeriod("R6.4")).toBe("2024-04");
    expect(parsePeriod("平成30年4月")).toBe("2018-04");
    expect(parsePeriod("昭和63年4月")).toBe("1988-04");
  });
  it("rejects invalid input", () => {
    expect(parsePeriod("2025-13")).toBeNull();
    expect(parsePeriod("abc")).toBeNull();
    expect(parsePeriod("")).toBeNull();
  });
});

describe("parseNumeric", () => {
  it("handles commas, full-width digits and units", () => {
    expect(parseNumeric("85,000")).toBe(85000);
    expect(parseNumeric("８５０００")).toBe(85000);
    expect(parseNumeric("¥85,000")).toBe(85000);
    expect(parseNumeric("123.45")).toBe(123.45);
  });
  it("returns null for empty/invalid", () => {
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("-")).toBeNull();
    expect(parseNumeric("abc")).toBeNull();
  });
});

describe("computeRates", () => {
  it("computes mom and yoy", () => {
    const points = [
      { period: "2024-04", value: 100 },
      { period: "2024-05", value: 110 },
      { period: "2025-04", value: 120 },
    ];
    const rates = computeRates(points);
    expect(rates.get("2024-05")?.mom).toBe(10);
    expect(rates.get("2025-04")?.yoy).toBe(20);
    expect(rates.get("2024-04")?.mom).toBeNull();
  });
  it("returns null on zero denominator", () => {
    const points = [
      { period: "2025-01", value: 0 },
      { period: "2025-02", value: 100 },
    ];
    const rates = computeRates(points);
    expect(rates.get("2025-02")?.mom).toBeNull();
  });
});

describe("normalizeSeries", () => {
  it("normalizes to base=100", () => {
    const points = [
      { period: "2025-01", value: 80 },
      { period: "2025-02", value: 100 },
      { period: "2025-03", value: 120 },
    ];
    const result = normalizeSeries(points, "2025-02");
    expect(result.baseRaw).toBe(100);
    expect(result.values.get("2025-01")).toBe(80);
    expect(result.values.get("2025-02")).toBe(100);
    expect(result.values.get("2025-03")).toBe(120);
  });
  it("falls back to first point when base missing", () => {
    const points = [{ period: "2025-01", value: 50 }];
    const result = normalizeSeries(points, "2020-01");
    expect(result.baseRaw).toBe(50);
    expect(result.baseUsed).toBe("2025-01");
  });
});

describe("detectAlerts", () => {
  it("flags high yoy", () => {
    const alerts = detectAlerts([
      {
        item_name: "アスファルト",
        region_name: "全国",
        points: [
          { period: "2024-06", value: 100 },
          { period: "2025-06", value: 125 },
        ],
      },
    ]);
    expect(alerts[0].priority).toBe("high");
    expect(alerts[0].reason).toContain("前年比");
  });
  it("flags medium mom", () => {
    const alerts = detectAlerts([
      {
        item_name: "H形鋼",
        region_name: "全国",
        points: [
          { period: "2025-01", value: 100 },
          { period: "2025-02", value: 106 },
        ],
      },
    ]);
    expect(alerts[0].priority).toBe("medium");
  });
  it("flags 3 consecutive months", () => {
    const alerts = detectAlerts([
      {
        item_name: "セメント",
        region_name: "全国",
        points: [
          { period: "2025-01", value: 100 },
          { period: "2025-02", value: 101 },
          { period: "2025-03", value: 102.5 },
          { period: "2025-04", value: 103 },
        ],
      },
    ]);
    expect(alerts[0].priority).toBe("low");
    expect(alerts[0].reason).toContain("連続上昇");
  });
});

describe("round2 / addMonths", () => {
  it("rounds to 2 decimals", () => {
    expect(round2(1.2345)).toBe(1.23);
  });
  it("adds months across years", () => {
    expect(addMonths("2025-12", 1)).toBe("2026-01");
    expect(addMonths("2025-01", -1)).toBe("2024-12");
  });
});
