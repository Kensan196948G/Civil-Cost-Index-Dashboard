import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseEstatMaterialSupply,
  estatRowsToCsvRows,
} from "../src/lib/estatMaterial";

function buildFixtureWorkbook(): ArrayBuffer {
  const aoa = [
    ["表 - ２", "", "", "", "", "", "", "", "", "", "Ｎｏ．１"],
    ["現在の主要資材の価格 ・ 需給動向及び在庫状況"],
    ["＜令和8年7月1～5日現在＞"],
    ["セメント　（ バラ物 ）"],
    ["地　方", "都道府県", "価格動向", "", "", "需給動向", "", "", "在庫状況", "", ""],
    ["", "", "前回調査\n6/1～5", "今回調査\n7/1～5", "前回調査\nとの差", "前回調査\n6/1～5", "今回調査\n7/1～5", "前回調査\nとの差", "前回調査\n6/1～5", "今回調査\n7/1～5", "前回調査\nとの差"],
    ["北海道", "北海道", "3.4", "3.2", "▲ 0.2", "3.1", "3.2", "0.1", "―", "―", "―"],
    ["東　北", "青森県", "3.1", "3.1", "0.0", "3.0", "3.0", "0.0", "―", "―", "―"],
    ["", "全国平均値", "3.26", "3.19", "▲ 0.07", "2.90", "2.91", "0.01", "―", "―", "―"],
    ["", "", "", "", "", "", "", "", "", "", "Ｎｏ．２"],
    ["生コンクリート"],
    ["地　方", "都道府県", "価格動向", "", "", "需給動向", "", "", "在庫状況", "", ""],
    ["", "", "前回調査", "今回調査", "差", "前回調査", "今回調査", "差", "前回調査", "今回調査", "差"],
    ["北海道", "北海道", "3.4", "3.3", "▲ 0.1", "3.1", "3.1", "0.0", "―", "―", "―"],
    ["", "全国平均値", "3.34", "3.26", "▲ 0.08", "2.86", "2.87", "0.01", "―", "―", "―"],
    ["", "", "", "", "", "", "", "", "", "", "Ｎｏ．13"],
    ["石油（ 軽油 ：１、２号 ）"],
    ["地　方", "都道府県", "価格動向", "", "", "需給動向", "", "", "在庫状況", "", ""],
    ["", "", "前回調査", "今回調査", "差", "前回調査", "今回調査", "差", "前回調査", "今回調査", "差"],
    ["", "全国平均値", "3.10", "(3.05)", "▲ 0.05", "2.90", "2.88", "▲ 0.02", "―", "―", "―"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "公表資料（表-２）_新様式");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseEstatMaterialSupply", () => {
  it("extracts national average rows for known materials with Reiwa period", () => {
    const parsed = parseEstatMaterialSupply(buildFixtureWorkbook());
    expect(parsed.skips).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.map((r) => [r.itemName, r.regionName, r.value])).toEqual([
      ["セメント", "全国", 3.19],
      ["生コンクリート", "全国", 3.26],
      ["軽油", "全国", 3.05],
    ]);
    expect(parsed.rows[0].period).toBe("2026-07");
  });

  it("does not ingest prefecture rows", () => {
    const parsed = parseEstatMaterialSupply(buildFixtureWorkbook());
    expect(parsed.rows.every((r) => r.regionName === "全国")).toBe(true);
  });

  it("reports unknown item sections as skips", () => {
    const aoa = [
      ["表 - ２"],
      ["＜令和8年7月1～5日現在＞"],
      ["新種合材（テスト）"],
      ["", "全国平均値", "1.0", "1.1", "0.1"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "表-２");
    const parsed = parseEstatMaterialSupply(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.skips.length).toBeGreaterThan(0);
    expect(parsed.skips[0].reason).toContain("未対応の品目");
  });

  it("throws when survey period is missing", () => {
    const aoa = [["表 - ２"], ["セメント"], ["", "全国平均値", "1.0", "1.1"]];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "表-２");
    expect(() =>
      parseEstatMaterialSupply(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer)
    ).toThrow(/調査年月/);
  });
});

describe("estatRowsToCsvRows", () => {
  it("emits canonical ingest rows with 指数 unit and source note", () => {
    const parsed = parseEstatMaterialSupply(buildFixtureWorkbook());
    const converted = estatRowsToCsvRows(parsed);
    expect(converted.rows[0]).toMatchObject({
      年月: "2026-07",
      品目: "セメント",
      地域: "全国",
      値: "3.19",
      単位: "指数",
      状態: "confirmed",
    });
    expect(converted.rows[0].注記).toContain("価格動向・今回調査");
  });
});
