import type { Sql } from "../lib/db";
import { parseCsv } from "../lib/csv";
import { parseNumeric, parsePeriod } from "../lib/stats";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const HEADER_ALIASES: Record<string, string[]> = {
  period: ["年月", "period", "対象年月", "Period"],
  item: ["品目", "item", "品目名", "項目"],
  standard: ["規格", "standard", "規格名", "仕様"],
  region: ["地域", "region", "地域名"],
  value: ["値", "value", "価格", "単価", "数値"],
  unit: ["単位", "unit"],
  status: ["状態", "status", "value_status"],
  note: ["注記", "note"],
  source: ["出典", "source"],
};

function resolveHeader(header: string): string | null {
  const h = header.trim();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return canonical;
  }
  return null;
}

export type UploadResult = {
  id: string;
  data_source_id: string;
  data_source_name: string;
  job_type: "manual_upload";
  status: string;
  file_name: string;
  file_hash: string;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  error_detail: Array<{ row: number; column: string; reason: string }>;
  started_at: string;
  finished_at: string;
};

export async function handleUpload(
  sql: Sql,
  input: { fileName: string; buffer: ArrayBuffer; dataSourceId: string }
): Promise<UploadResult> {
  const { fileName, buffer, dataSourceId } = input;
  if (buffer.byteLength > MAX_FILE_BYTES) {
    const err = new Error("ファイルサイズは5MB以内にしてください。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (!/\.csv$/i.test(fileName)) {
    const err = new Error("CSVファイルのみアップロード可能です。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const sourceRows = await sql`SELECT id, source_name FROM data_sources WHERE id = ${dataSourceId}`;
  if (sourceRows.length === 0) {
    const err = new Error("データソースが見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const dataSourceName = sourceRows[0].source_name as string;

  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const fileHash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const dup = await sql`
    SELECT id FROM source_files
    WHERE data_source_id = ${dataSourceId} AND file_hash = ${fileHash}
  `;
  if (dup.length > 0) {
    const err = new Error("同一内容のファイルが既に登録されています。");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    const err = new Error("CSVにデータ行がありません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const mapped = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      const canonical = resolveHeader(k);
      if (canonical && out[canonical] === undefined) out[canonical] = v;
    }
    return out;
  });

  const items = await sql`
    SELECT id, item_code, item_name, category, default_unit FROM items WHERE is_active = true
  `;
  const regions = await sql`
    SELECT id, region_code, region_name FROM regions WHERE is_active = true
  `;
  const itemByCode = new Map(items.map((i) => [String(i.item_code), i]));
  const itemByName = new Map(items.map((i) => [String(i.item_name), i]));
  const regionByCode = new Map(regions.map((r) => [String(r.region_code), r]));
  const regionByName = new Map(regions.map((r) => [String(r.region_name), r]));

  const errorDetail: Array<{ row: number; column: string; reason: string }> = [];
  let successRows = 0;
  const startedAt = new Date().toISOString();

  for (let i = 0; i < mapped.length; i++) {
    const row = mapped[i];
    const rowNo = i + 2;
    const period = parsePeriod(row.period ?? "");
    if (!period) {
      errorDetail.push({ row: rowNo, column: "年月", reason: "年月形式が不正です（YYYY-MM等）" });
      continue;
    }
    const rawValue = parseNumeric(row.value ?? "");
    if (rawValue == null) {
      errorDetail.push({ row: rowNo, column: "値", reason: "数値変換に失敗しました" });
      continue;
    }
    const itemName = (row.item ?? "").trim();
    const item = itemByCode.get(itemName) ?? itemByName.get(itemName);
    if (!item) {
      errorDetail.push({ row: rowNo, column: "品目", reason: "品目マスタに未登録です" });
      continue;
    }
    const regionName = (row.region ?? "").trim();
    const region = regionByCode.get(regionName) ?? regionByName.get(regionName);
    if (!region) {
      errorDetail.push({ row: rowNo, column: "地域", reason: "地域マスタに未登録です" });
      continue;
    }
    const unit = (row.unit ?? "").trim() || (item.default_unit ?? "");
    const statusMap: Record<string, string> = {
      confirmed: "confirmed",
      preliminary: "preliminary",
      revised: "revised",
      missing: "missing",
      〆: "confirmed",
      速報: "preliminary",
      〆確: "confirmed",
      確報: "confirmed",
      改定: "revised",
      欠損: "missing",
    };
    const valueStatus = statusMap[(row.status ?? "confirmed").trim().toLowerCase()] ?? "confirmed";
    await sql`
      INSERT INTO time_series_values
        (data_source_id, data_type, item_id, region_id, period_type, period_date,
         value, unit, original_item_name, original_region_name, value_status, note)
      VALUES
        (${dataSourceId}, ${item.category}, ${item.id}, ${region.id}, 'monthly',
         ${`${period}-01`}::date, ${rawValue}, ${unit || null}, ${itemName}, ${regionName},
         ${valueStatus}, ${row.note || null})
      ON CONFLICT (data_source_id, data_type, item_id, region_id, period_date, unit)
      DO UPDATE SET value = EXCLUDED.value, value_status = EXCLUDED.value_status,
                    note = EXCLUDED.note, updated_at = now()
    `;
    successRows++;
  }

  const totalRows = mapped.length;
  const errorRows = totalRows - successRows;
  const status = errorRows === 0 ? "success" : successRows === 0 ? "failed" : "partial_success";

  const [fileRow] = await sql`
    INSERT INTO source_files
      (data_source_id, file_name, file_format, file_hash, fetch_status)
    VALUES
      (${dataSourceId}, ${fileName}, 'csv', ${fileHash}, 'success')
    RETURNING id, to_char(fetched_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS fetched_at
  `;

  const finishedAt = new Date().toISOString();
  await sql`
    INSERT INTO transform_logs
      (source_file_id, transform_status, total_rows, success_rows, error_rows,
       error_detail, started_at, finished_at)
    VALUES
      (${fileRow.id}, ${status}, ${totalRows}, ${successRows}, ${errorRows},
       ${JSON.stringify(errorDetail)}, ${startedAt}::timestamptz, ${finishedAt}::timestamptz)
  `;
  await sql`UPDATE data_sources SET last_fetched_at = now(), updated_at = now() WHERE id = ${dataSourceId}`;

  return {
    id: String(fileRow.id),
    data_source_id: dataSourceId,
    data_source_name: dataSourceName,
    job_type: "manual_upload",
    status,
    file_name: fileName,
    file_hash: `sha256:${fileHash}`,
    total_rows: totalRows,
    success_rows: successRows,
    error_rows: errorRows,
    error_detail: errorDetail,
    started_at: startedAt,
    finished_at: finishedAt,
  };
}
