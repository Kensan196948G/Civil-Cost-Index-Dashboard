import { describe, expect, it } from "vitest";
import { mlitLaborRowsToCsvRows, parseMlitLaborText } from "../src/lib/mlitLabor";

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県",
  "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県",
  "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県",
  "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

function fixedLine(code: number, name: string, values: Array<[number, number]>): string {
  const chars = Array(120).fill(" ");
  const put = (start: number, value: string) => value.split("").forEach((char, index) => { chars[start + index] = char; });
  put(0, `${String(code).padStart(2, "0")} ${name}`);
  for (const [start, value] of values) put(start, value.toLocaleString("en-US"));
  return chars.join("");
}

function fixtureTables(): [string, string] {
  const first = PREFECTURES.map((name, index) => fixedLine(index + 1, name, [
    [15, 20_000 + index], [24, 21_000 + index], [97, 22_000 + index],
  ])).join("\n");
  const formwork = PREFECTURES.map((name, index) => fixedLine(index + 1, name, [
    [33, 23_000 + index],
  ])).join("\n");
  return [first, formwork];
}

describe("parseMlitLaborText", () => {
  it("extracts four occupations for all 47 prefectures", () => {
    const [first, formwork] = fixtureTables();
    const parsed = parseMlitLaborText(first, formwork);
    expect(parsed).toHaveLength(47);
    expect(parsed[0]).toMatchObject({ prefectureCode: "01", prefectureName: "北海道", special: 20_000, carpenter: 23_000 });
    expect(parsed[46]).toMatchObject({ prefectureCode: "47", prefectureName: "沖縄県", common: 21_046, ironworker: 22_046 });
    const csvRows = mlitLaborRowsToCsvRows(parsed);
    expect(csvRows).toHaveLength(188);
    expect(csvRows[0]).toMatchObject({ 年月: "2026-03", 品目: "特殊作業員", 単位: "円/日" });
  });

  it("rejects incomplete prefecture tables", () => {
    const [first, formwork] = fixtureTables();
    expect(() => parseMlitLaborText(first, formwork.split("\n").slice(0, 46).join("\n"))).toThrow(/都道府県 47/);
  });
});
