#!/usr/bin/env node
// Seed time-series data from data/samples/*.csv (idempotent by file hash).
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", "..");

// Load local secrets from apps/api/.dev.vars when env vars are absent.
const devVarsPath = path.join(__dirname, "..", ".dev.vars");
if (!process.env.DATABASE_URL && existsSync(devVarsPath)) {
  for (const line of readFileSync(devVarsPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

function parseCsv(text) {
  const lines = [];
  let current = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { current.push(field); field = ""; };
  const pushLine = () => { if (current.some((c) => c.trim() !== "")) lines.push(current); current = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") pushField();
    else if (ch === "\n") { pushField(); pushLine(); }
    else if (ch !== "\r") field += ch;
  }
  pushField();
  pushLine();
  const header = lines[0]?.map((h) => h.trim()) ?? [];
  return lines.slice(1).map((line) => {
    const row = {};
    header.forEach((h, idx) => { row[h] = (line[idx] ?? "").trim(); });
    return row;
  });
}

const toHalfWidth = (s) => String(s)
  .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  .replace(/[，、]/g, ",");

function parsePeriod(value) {
  const s = toHalfWidth(value).trim();
  let m = s.match(/^(\d{4})[-/年](\d{1,2})月?$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}`;
}

function parseNumeric(value) {
  const cleaned = toHalfWidth(value).replace(/,/g, "").replace(/[¥￥円]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const FILES = [
  { file: "data/samples/sample_material_prices.csv", sourceCode: "SAMPLE_MATERIAL" },
  { file: "data/samples/sample_labor_costs.csv", sourceCode: "SAMPLE_LABOR" },
  { file: "data/samples/sample_price_index.csv", sourceCode: "SAMPLE_INDEX" },
];

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const items = (await client.query("SELECT id, item_code, item_name, category, default_unit FROM items WHERE is_active = true")).rows;
  const regions = (await client.query("SELECT id, region_code, region_name FROM regions WHERE is_active = true")).rows;
  const itemByName = new Map(items.map((i) => [i.item_name, i]));
  const itemByCode = new Map(items.map((i) => [i.item_code, i]));
  const regionByName = new Map(regions.map((r) => [r.region_name, r]));

  for (const entry of FILES) {
    const filePath = path.join(root, entry.file);
    if (!existsSync(filePath)) { console.warn(`skip (not found): ${entry.file}`); continue; }
    const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const hash = createHash("sha256").update(raw).digest("hex");
    const source = (await client.query("SELECT id, source_name FROM data_sources WHERE source_code = $1", [entry.sourceCode])).rows[0];
    if (!source) { console.warn(`skip (source not found): ${entry.sourceCode}`); continue; }

    const dup = await client.query(
      "SELECT id FROM source_files WHERE data_source_id = $1 AND file_hash = $2",
      [source.id, hash]
    );
    if (dup.rows.length > 0) { console.log(`skip (already seeded): ${entry.file}`); continue; }

    const rows = parseCsv(raw);
    let success = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNo = i + 2;
      const period = parsePeriod(row["年月"] ?? row["period"] ?? "");
      const value = parseNumeric(row["値"] ?? row["value"] ?? "");
      const item = itemByName.get(row["品目"] ?? row["item"] ?? "") ?? itemByCode.get(row["品目"] ?? row["item"] ?? "");
      const region = regionByName.get(row["地域"] ?? row["region"] ?? "");
      if (!period || value == null || !item || !region) {
        errors.push({ row: rowNo, reason: "年月/値/品目/地域のいずれかが不正" });
        continue;
      }
      const unit = (row["単位"] ?? "").trim() || item.default_unit || null;
      await client.query(
        `INSERT INTO time_series_values
           (data_source_id, data_type, item_id, region_id, period_type, period_date, value, unit,
            original_item_name, original_region_name, value_status, note)
         VALUES ($1, $2, $3, $4, 'monthly', $5::date, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (data_source_id, data_type, item_id, region_id, period_date, unit)
         DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [source.id, item.category, item.id, region.id, `${period}-01`, value, unit,
         row["品目"] ?? "", row["地域"] ?? "", row["状態"] ?? "confirmed", row["注記"] ?? null]
      );
      success++;
    }

    const fileRow = (await client.query(
      `INSERT INTO source_files (data_source_id, file_name, file_format, file_hash, fetch_status)
       VALUES ($1, $2, 'csv', $3, 'success') RETURNING id`,
      [source.id, path.basename(filePath), hash]
    )).rows[0];
    await client.query(
      `INSERT INTO transform_logs
         (source_file_id, transform_status, total_rows, success_rows, error_rows, error_detail, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())`,
      [fileRow.id, errors.length === 0 ? "success" : "partial_success", rows.length, success, errors.length, JSON.stringify(errors)]
    );
    await client.query("UPDATE data_sources SET last_fetched_at = now(), updated_at = now() WHERE id = $1", [source.id]);
    console.log(`seeded ${entry.file}: ${success}/${rows.length} rows, ${errors.length} errors`);
  }
  console.log("seed complete");
} finally {
  await client.end();
}
