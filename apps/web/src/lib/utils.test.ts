import { describe, expect, it } from "vitest";
import { csvFileName, formatPeriod, formatRate, loadPrefs } from "./utils";

describe("formatRate", () => {
  it("formats positive/negative/null", () => {
    expect(formatRate(1.25)).toBe("+1.3%");
    expect(formatRate(-0.8)).toBe("-0.8%");
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
  });
});

describe("formatPeriod", () => {
  it("converts YYYY-MM to Japanese display", () => {
    expect(formatPeriod("2026-06")).toBe("2026年6月");
    expect(formatPeriod(null)).toBe("—");
  });
});

describe("csvFileName", () => {
  it("contains date", () => {
    expect(csvFileName()).toMatch(/^cci-export-\d{8}\.csv$/);
  });
});

describe("loadPrefs", () => {
  it("returns empty object without localStorage", () => {
    expect(loadPrefs()).toEqual({});
  });
});
