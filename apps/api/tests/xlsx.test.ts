import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbookRows } from "../src/lib/csv";

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

describe("parseWorkbookRows", () => {
  it("parses first sheet with header row", () => {
    const buf = workbookBuffer([
      ["年月", "品目", "地域", "値"],
      ["2026-04", "H形鋼", "全国", 85000],
      ["2026-05", "H形鋼", "全国", 85500],
    ]);
    const rows = parseWorkbookRows(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ 年月: "2026-04", 品目: "H形鋼", 地域: "全国", 値: "85000" });
  });

  it("skips empty leading rows and blank lines", () => {
    const buf = workbookBuffer([
      [],
      ["", ""],
      ["年月", "値"],
      ["2026-04", 100],
      [],
    ]);
    const rows = parseWorkbookRows(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ 年月: "2026-04", 値: "100" });
  });
});
