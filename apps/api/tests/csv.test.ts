import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../src/lib/csv";

describe("parseCsv", () => {
  it("parses basic rows with headers", () => {
    const rows = parseCsv("年月,品目,値\n2025-01,H形鋼,85000\n2025-02,H形鋼,85500\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ 年月: "2025-01", 品目: "H形鋼", 値: "85000" });
  });
  it("handles quoted fields with commas and newlines", () => {
    const rows = parseCsv('a,b\n"x,1","y\nz"\n');
    expect(rows[0]).toEqual({ a: "x,1", b: "y\nz" });
  });
  it("skips empty lines", () => {
    const rows = parseCsv("a,b\n\n1,2\n");
    expect(rows).toHaveLength(1);
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'say "hi"']]);
    expect(csv).toBe('a,b\r\n"x,y","say ""hi"""');
  });
});
