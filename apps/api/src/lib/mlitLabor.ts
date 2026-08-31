import type { CsvRow } from "./csv";

const PREFECTURE_PATTERN = /\b(0[1-9]|[1-4]\d)\s+(\S+[都道府県])/;

type LaborValues = {
  prefectureCode: string;
  prefectureName: string;
  special: number;
  common: number;
  ironworker: number;
  carpenter: number;
};

function valueAt(line: string, start: number): number | null {
  const match = line.slice(start, start + 8).match(/[\d,]+/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function prefectureLines(text: string): Map<string, { name: string; line: string }> {
  const found = new Map<string, { name: string; line: string }>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(PREFECTURE_PATTERN);
    if (match) found.set(match[1], { name: match[2], line });
  }
  return found;
}

export function parseMlitLaborText(firstTable: string, formworkTable: string): LaborValues[] {
  const first = prefectureLines(firstTable);
  const formwork = prefectureLines(formworkTable);
  const rows: LaborValues[] = [];

  for (let code = 1; code <= 47; code++) {
    const key = String(code).padStart(2, "0");
    const firstRow = first.get(key);
    const formworkRow = formwork.get(key);
    if (!firstRow || !formworkRow || firstRow.name !== formworkRow.name) {
      throw new Error(`都道府県 ${key} の表行が不足または不一致です。`);
    }
    const special = valueAt(firstRow.line, 15);
    const common = valueAt(firstRow.line, 24);
    const ironworker = valueAt(firstRow.line, 97);
    const carpenter = valueAt(formworkRow.line, 33);
    if ([special, common, ironworker, carpenter].some((value) => value == null)) {
      throw new Error(`都道府県 ${key} ${firstRow.name} の対象4職種を抽出できません。`);
    }
    rows.push({
      prefectureCode: key,
      prefectureName: firstRow.name,
      special: special!,
      common: common!,
      ironworker: ironworker!,
      carpenter: carpenter!,
    });
  }
  return rows;
}

export function mlitLaborRowsToCsvRows(rows: LaborValues[]): CsvRow[] {
  const occupations = [
    ["特殊作業員", "special"],
    ["普通作業員", "common"],
    ["鉄筋工", "ironworker"],
    ["型枠工", "carpenter"],
  ] as const;
  return rows.flatMap((row) => occupations.map(([name, key]) => ({
    年月: "2026-03",
    品目: name,
    規格: "所定労働時間内8時間当たり",
    地域: row.prefectureName,
    値: String(row[key]),
    単位: "円/日",
    状態: "confirmed",
    出典: "国土交通省 令和8年3月適用 公共工事設計労務単価",
    注記: "現場管理費・一般管理費等の諸経費、時間外・休日・深夜割増賃金を含まない。公式PDFを加工。",
  })));
}
