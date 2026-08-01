import type { Sql } from "../lib/db";
import { parseCsv, parseWorkbookRows, type CsvRow } from "../lib/csv";
import { decodeBuffer } from "../lib/decode";
import { ingestRows, type IngestResult } from "./ingest";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
export type UploadResult = IngestResult;

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
  if (!/\.(csv|xlsx)$/i.test(fileName)) {
    const err = new Error("CSV / Excel ファイルのみアップロード可能です。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

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

  let rows: CsvRow[];
  if (/\.xlsx$/i.test(fileName)) {
    rows = parseWorkbookRows(buffer);
  } else {
    rows = parseCsv(decodeBuffer(buffer));
  }
  if (rows.length === 0) {
    const err = new Error("ファイルにデータ行がありません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  return ingestRows({
    sql,
    dataSourceId,
    rows,
    fileName,
    fileHash,
    jobType: "manual_upload",
    fileFormat: /\.xlsx$/i.test(fileName) ? "xlsx" : "csv",
  });
}
