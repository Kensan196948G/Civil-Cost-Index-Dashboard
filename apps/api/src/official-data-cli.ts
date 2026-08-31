import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEstatMaterialSupply, estatRowsToCsvRows } from "./lib/estatMaterial";
import { toCsv, type CsvRow } from "./lib/csv";
import { mlitLaborRowsToCsvRows, parseMlitLaborText } from "./lib/mlitLabor";

const HEADERS = ["年月", "品目", "規格", "地域", "値", "単位", "状態", "出典", "注記"];

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function writeDataset(
  outputPath: string,
  manifestPath: string,
  rows: CsvRow[],
  source: Record<string, unknown>,
  original: Buffer
) {
  const csv = toCsv(HEADERS, rows.map((row) => HEADERS.map((header) => row[header] ?? "")))
    .replace(/\r\n/g, "\n") + "\n";
  writeFileSync(outputPath, csv, "utf8");
  writeFileSync(manifestPath, JSON.stringify({
    ...source,
    source_sha256: sha256(original),
    normalized_sha256: sha256(csv),
    normalized_rows: rows.length,
    transformation: "公式公表資料から対象系列を抽出し、標準CSVへ編集・加工",
  }, null, 2) + "\n", "utf8");
}

const [command, inputPath, outputPath, manifestPath] = process.argv.slice(2);
if (!command || !inputPath || !outputPath || !manifestPath) {
  console.error("usage: official-data-cli <mlit-labor|estat-material> <input> <output.csv> <manifest.json>");
  process.exit(2);
}

const original = readFileSync(inputPath);
if (command === "mlit-labor") {
  const first = execFileSync("pdftotext", ["-layout", "-f", "8", "-l", "8", inputPath, "-"], { encoding: "utf8" });
  const formwork = execFileSync("pdftotext", ["-layout", "-f", "11", "-l", "11", inputPath, "-"], { encoding: "utf8" });
  const rows = mlitLaborRowsToCsvRows(parseMlitLaborText(first, formwork));
  writeDataset(outputPath, manifestPath, rows, {
    dataset: "令和8年3月から適用する公共工事設計労務単価",
    publisher: "国土交通省",
    source_url: "https://www.mlit.go.jp/report/press/content/001981942.pdf",
    published_at: "2026-02-17",
    applicable_from: "2026-03-01",
    license: "公共データ利用規約（第1.0版）",
    license_url: "https://www.mlit.go.jp/link.html",
    attribution: "出典：国土交通省『令和8年3月から適用する公共工事設計労務単価』を加工して作成",
  }, original);
} else if (command === "estat-material") {
  const arrayBuffer = original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength);
  const parsed = estatRowsToCsvRows(parseEstatMaterialSupply(arrayBuffer));
  if (parsed.rows.length === 0) throw new Error("e-Stat workbookから対象行を抽出できません。");
  const rows = parsed.rows.map((row) => ({
    ...row,
    出典: "e-Stat 主要建設資材需給・価格動向調査 2026年7月",
  }));
  writeDataset(outputPath, manifestPath, rows, {
    dataset: "主要建設資材需給・価格動向調査 2026年7月",
    publisher: "国土交通省",
    source_url: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040478417&fileKind=0",
    published_at: "2026-07-27",
    survey_period: "2026-07",
    selection_policy: "全国平均の価格動向・今回調査を抽出。アスファルトは既存マスタと一意に対応する新材のみを採用し、再生材は除外。",
    skipped_rows: parsed.skips,
    license: "e-Stat利用規約（政府標準利用規約2.0、CC BY 4.0互換）",
    license_url: "https://www.e-stat.go.jp/terms-of-use",
    attribution: "出典：政府統計の総合窓口(e-Stat)『主要建設資材需給・価格動向調査』を加工して作成",
  }, original);
} else {
  throw new Error(`unknown command: ${command}`);
}

console.log(`generated ${outputPath}`);
