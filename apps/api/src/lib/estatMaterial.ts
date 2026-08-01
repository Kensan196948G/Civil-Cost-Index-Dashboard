import * as XLSX from "xlsx";
import type { CsvRow } from "./csv";

/**
 * Converter for "e-Stat 主要建設資材需給・価格動向調査" workbook (表-2).
 *
 * The official workbook is a survey report (価格動向/需給動向/在庫状況, 1-5 scale)
 * rather than a flat price table. This converter extracts the national average
 * (全国平均値) of the 価格動向・今回調査 column for each material and emits rows
 * compatible with the standard ingestion format:
 *   年月, 品目, 地域, 値, 単位, 状態, 注記
 */

const ITEM_ALIASES: Array<{ matcher: RegExp; itemName: string }> = [
  { matcher: /セメント/, itemName: "セメント" },
  { matcher: /生コンクリート/, itemName: "生コンクリート" },
  { matcher: /骨材\s*（\s*砂\s*）/i, itemName: "骨材（砂）" },
  { matcher: /骨材\s*（\s*砂利\s*）/i, itemName: "骨材（砂利）" },
  { matcher: /骨材\s*（\s*砕石\s*）/i, itemName: "骨材（砕石）" },
  { matcher: /骨材\s*（\s*再生砕石\s*）/i, itemName: "骨材（再生砕石）" },
  { matcher: /アスファルト合材/i, itemName: "アスファルト" },
  { matcher: /異形棒鋼/i, itemName: "異形棒鋼" },
  { matcher: /Ｈ形鋼|H形鋼/i, itemName: "H形鋼" },
  { matcher: /木材\s*（\s*製材\s*）/i, itemName: "木材（製材）" },
  { matcher: /木材\s*（\s*型枠用合板\s*）/i, itemName: "木材（型枠用合板）" },
  { matcher: /軽油/, itemName: "軽油" },
];

const SECTION_KEYWORDS =
  /（|コンクリート|骨材|木材|石油|合材|棒鋼|Ｈ形鋼|H形鋼/;

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseReiwaPeriod(text: string): string | null {
  const m = text.match(/令和\s*(\d+)\s*年\s*(\d{1,2})\s*月/);
  if (m) {
    const year = 2018 + Number(m[1]);
    return `${year}-${String(Number(m[2])).padStart(2, "0")}`;
  }
  const h = text.match(/平成\s*(\d+)\s*年\s*(\d{1,2})\s*月/);
  if (h) {
    const year = 1988 + Number(h[1]);
    return `${year}-${String(Number(h[2])).padStart(2, "0")}`;
  }
  return null;
}

function parseIndexValue(value: unknown): number | null {
  const normalized = normalizeText(value)
    .normalize("NFKC")
    .replace(/[▲▼]/g, "")
    .replace(/[（）()]/g, "")
    .replace(/,/g, "");
  if (!normalized || normalized === "―" || normalized === "-") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function resolveItemName(raw: string): string | null {
  const normalized = normalizeText(raw);
  for (const alias of ITEM_ALIASES) {
    if (alias.matcher.test(normalized)) return alias.itemName;
  }
  return null;
}

export type EstatMaterialRow = {
  period: string;
  itemName: string;
  rawItemName: string;
  regionName: string;
  value: number;
};

export function parseEstatMaterialSupply(buffer: ArrayBuffer): {
  rows: EstatMaterialRow[];
  skips: Array<{ row: number; reason: string }>;
} {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName =
    wb.SheetNames.find((n) => /表-?2|表-?２/.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { rows: [], skips: [] };
  const aoa = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  let period: string | null = null;
  for (const line of aoa) {
    const joined = normalizeText(line.join(" "));
    period = parseReiwaPeriod(joined);
    if (period) break;
  }
  if (!period) {
    throw new Error("調査年月（令和○年○月）がファイル内に見つかりません。");
  }

  const rows: EstatMaterialRow[] = [];
  const skips: Array<{ row: number; reason: string }> = [];
  let currentItem: string | null = null;
  let currentRawItem = "";

  for (let i = 0; i < aoa.length; i++) {
    const line = aoa[i];
    const col0 = normalizeText(line[0]);
    const col1 = normalizeText(line[1]);
    const hasNumbers = line
      .slice(2, 12)
      .some((v) => /[0-9０-９]/.test(String(v ?? "")));

    // New item section: title in column A, empty column B, no numbers yet.
    if (col0 && !col1 && !hasNumbers && SECTION_KEYWORDS.test(col0)) {
      const itemName = resolveItemName(col0);
      if (itemName) {
        currentItem = itemName;
        currentRawItem = col0;
      } else {
        currentItem = null;
        skips.push({ row: i + 1, reason: `未対応の品目: ${col0}` });
      }
      continue;
    }
    if (!currentItem) continue;

    // National average row (実ファイルでは列A、一部の派生形式では列Bに記載される)。
    if (/全国平均値/.test(col0) || /全国平均値/.test(col1)) {
      const value = parseIndexValue(line[3]);
      if (value == null) {
        skips.push({ row: i + 1, reason: `${currentItem} 全国平均値の値が取得できません` });
        continue;
      }
      rows.push({
        period,
        itemName: currentItem,
        rawItemName: currentRawItem,
        regionName: "全国",
        value,
      });
      continue;
    }

    // Prefecture rows are intentionally not ingested (the region master is
    // national + 8 areas; aggregating survey indices would be misleading).
    // They remain available in the source file for manual reference.
  }

  return { rows, skips };
}

/** Convert converter output into canonical ingest rows. */
export function estatRowsToCsvRows(
  input: ReturnType<typeof parseEstatMaterialSupply>
): { rows: CsvRow[]; skips: Array<{ row: number; column: string; reason: string }> } {
  const rows: CsvRow[] = input.rows.map((r) => ({
    年月: r.period,
    品目: r.itemName,
    地域: r.regionName,
    値: String(r.value),
    単位: "指数",
    状態: "confirmed",
    注記: `e-Stat 主要建設資材需給・価格動向調査（価格動向・今回調査）: ${r.rawItemName}`,
  }));
  const skips = input.skips.map((s) => ({
    row: s.row,
    column: "品目",
    reason: s.reason,
  }));
  return { rows, skips };
}
