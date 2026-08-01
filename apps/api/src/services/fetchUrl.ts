import type { Sql } from "../lib/db";
import { decodeBuffer } from "../lib/decode";
import { parseCsv, parseWorkbookRows, type CsvRow } from "../lib/csv";
import {
  parseEstatMaterialSupply,
  estatRowsToCsvRows,
} from "../lib/estatMaterial";
import { ingestRows, type IngestResult } from "./ingest";

const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 30_000;

const PRIVATE_IPV4_PATTERNS: Array<{ re: RegExp; name: string }> = [
  { re: /^0\./, name: "0.0.0.0/8" },
  { re: /^10\./, name: "10.0.0.0/8" },
  { re: /^127\./, name: "127.0.0.0/8" },
  { re: /^169\.254\./, name: "169.254.0.0/16" },
  { re: /^172\.(1[6-9]|2\d|3[01])\./, name: "172.16.0.0/12" },
  { re: /^192\.168\./, name: "192.168.0.0/16" },
  { re: /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, name: "100.64.0.0/10" },
  { re: /^198\.18\.|^198\.19\./, name: "198.18.0.0/15" },
  { re: /^192\.0\.0\.|^192\.0\.2\./, name: "192.0.0.0/24, 192.0.2.0/24" },
  { re: /^192\.88\.99\./, name: "192.88.99.0/24" },
  { re: /^203\.0\.113\./, name: "203.0.113.0/24" },
  { re: /^22[4-9]\.|^23[0-9]\./, name: "multicast 224.0.0.0/4" },
  { re: /^255\./, name: "broadcast" },
];

function isPrivateIpv4(host: string): { blocked: boolean; name: string } {
  const octets = host.split(".");
  if (octets.length !== 4) return { blocked: false, name: "" };
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return { blocked: false, name: "" };
    if (Number(octet) > 255) return { blocked: true, name: "invalid IPv4" };
  }
  for (const p of PRIVATE_IPV4_PATTERNS) {
    if (p.re.test(host)) return { blocked: true, name: p.name };
  }
  return { blocked: false, name: "" };
}

function isPrivateHostname(hostname: string): { blocked: boolean; name: string } {
  let host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const zoneIndex = host.indexOf("%");
  if (zoneIndex >= 0) host = host.slice(0, zoneIndex);

  if (host.includes(":")) {
    // IPv6 literal
    const v4Mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4Mapped) return isPrivateIpv4(v4Mapped[1]);
    const v4MappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (v4MappedHex) {
      const hi = parseInt(v4MappedHex[1], 16);
      const lo = parseInt(v4MappedHex[2], 16);
      const ipv4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
      return isPrivateIpv4(ipv4);
    }
    if (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe8") ||
      host.startsWith("fe9") ||
      host.startsWith("fea") ||
      host.startsWith("feb") ||
      host.startsWith("2001:db8") ||
      host.startsWith("2001:10") ||
      host.startsWith("2002:")
    ) {
      return { blocked: true, name: "reserved IPv6" };
    }
    return { blocked: false, name: "" };
  }

  const ipCheck = isPrivateIpv4(host);
  if (ipCheck.blocked) return ipCheck;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return { blocked: true, name: "loopback/local hostname" };
  }
  return { blocked: false, name: "" };
}

export function isAllowedHost(hostname: string, allowedHosts?: string): { ok: boolean; reason?: string } {
  const list = (allowedHosts ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return { ok: true };
  const host = hostname.toLowerCase();
  for (const entry of list) {
    if (entry === host) return { ok: true };
    if (entry.startsWith("*.") && host.endsWith(entry.slice(1))) return { ok: true };
  }
  return { ok: false, reason: `ホスト ${hostname} は FETCH_ALLOWED_HOSTS にありません` };
}

export function validateFetchUrl(rawUrl: string, allowedHosts?: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const err = new Error("取得URLが不正です。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    const err = new Error("http/https のURLのみ取得可能です。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (parsed.username || parsed.password) {
    const err = new Error("URLに資格情報を含めることはできません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const hostCheck = isPrivateHostname(parsed.hostname);
  if (hostCheck.blocked) {
    const err = new Error(`プライベート/予約アドレスへの取得は許可されていません（${hostCheck.name}）。`);
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const allowCheck = isAllowedHost(parsed.hostname, allowedHosts);
  if (!allowCheck.ok) {
    const err = new Error(allowCheck.reason ?? "ホストが許可されていません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  return parsed;
}

async function readBodyWithLimit(response: Response): Promise<ArrayBuffer> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_DOWNLOAD_BYTES) {
    const err = new Error(`ファイルサイズは${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB以内にしてください。`);
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (!response.body) return new ArrayBuffer(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_DOWNLOAD_BYTES) {
          await reader.cancel();
          const err = new Error(`ファイルサイズは${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB以内にしてください。`);
          (err as Error & { status?: number }).status = 400;
          throw err;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

export async function downloadUrl(
  rawUrl: string,
  opts: { allowedHosts?: string } = {}
): Promise<{ buffer: ArrayBuffer; finalUrl: string; contentType: string | null }> {
  let current = validateFetchUrl(rawUrl, opts.allowedHosts).toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Civil-Cost-Index-Dashboard/0.1; +https://github.com/Kensan196948G/Civil-Cost-Index-Dashboard)",
        Accept: "text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*;q=0.5",
      },
    });
    if (
      res.status === 301 ||
      res.status === 302 ||
      res.status === 303 ||
      res.status === 307 ||
      res.status === 308
    ) {
      const location = res.headers.get("location");
      if (!location) {
        const err = new Error(`リダイレクト先がありません（HTTP ${res.status}）。`);
        (err as Error & { status?: number }).status = 502;
        throw err;
      }
      current = validateFetchUrl(new URL(location, current).toString(), opts.allowedHosts).toString();
      continue;
    }
    if (!res.ok) {
      const err = new Error(`ダウンロードに失敗しました（HTTP ${res.status}）。`);
      (err as Error & { status?: number }).status = 502;
      throw err;
    }
    const buffer = await readBodyWithLimit(res);
    return {
      buffer,
      finalUrl: current,
      contentType: res.headers.get("content-type"),
    };
  }
  const err = new Error(`リダイレクトが${MAX_REDIRECTS}回を超えました。`);
  (err as Error & { status?: number }).status = 502;
  throw err;
}

export function sniffFormat(
  buffer: ArrayBuffer,
  url: string,
  contentType: string | null
): "csv" | "xlsx" {
  const path = new URL(url).pathname.toLowerCase();
  const bytes = new Uint8Array(buffer);
  const isZip =
    bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (path.endsWith(".xlsx") || isZip) return "xlsx";
  if (path.endsWith(".csv") || (contentType ?? "").includes("csv")) return "csv";
  if (isZip) return "xlsx";
  // application/octet-stream without extension: sniff text
  const sample = decodeBuffer(buffer.slice(0, Math.min(buffer.byteLength, 4096)));
  if (/[\u3000-\u9fff\uff00-\uffef]|[,，]/.test(sample)) return "csv";
  const err = new Error("CSV/Excel ファイルの形式を判別できませんでした。");
  (err as Error & { status?: number }).status = 400;
  throw err;
}

function deriveFileName(finalUrl: string, format: "csv" | "xlsx"): string {
  const pathname = new URL(finalUrl).pathname;
  const last = pathname.split("/").filter(Boolean).pop();
  if (last && /\.(csv|xlsx)$/i.test(last)) return last;
  const date = new Date().toISOString().slice(0, 10);
  return `official-fetch-${date}.${format}`;
}

export async function fetchFromUrl(
  sql: Sql,
  input: { dataSourceId: string; url?: string },
  env?: { FETCH_ALLOWED_HOSTS?: string }
): Promise<IngestResult> {
  const sourceRows = await sql`
    SELECT id, source_code, source_name, source_url FROM data_sources WHERE id = ${input.dataSourceId}
  `;
  if (sourceRows.length === 0) {
    const err = new Error("データソースが見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const source = sourceRows[0];
  const target = (input.url ?? "").trim() || String(source.source_url ?? "");
  if (!target) {
    const err = new Error("取得URLが未設定です（URLを指定するか、データソースの source_url を登録してください）。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const { buffer, finalUrl, contentType } = await downloadUrl(target, {
    allowedHosts: env?.FETCH_ALLOWED_HOSTS,
  });
  const format = sniffFormat(buffer, finalUrl, contentType);

  let rows: CsvRow[];
  let extraErrorRows: Array<{ row: number; column: string; reason: string }> = [];
  if (format === "xlsx" && String(source.source_code) === "ESTAT_MATERIAL_SUPPLY") {
    const parsed = parseEstatMaterialSupply(buffer);
    const converted = estatRowsToCsvRows(parsed);
    rows = converted.rows;
    extraErrorRows = converted.skips;
  } else if (format === "xlsx") {
    rows = parseWorkbookRows(buffer);
  } else {
    rows = parseCsv(decodeBuffer(buffer));
  }
  if (rows.length === 0) {
    const err = new Error("データ行がありません（専用変換対象外のファイル形式の可能性があります）。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const fileHash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const dup = await sql`
    SELECT id FROM source_files
    WHERE data_source_id = ${input.dataSourceId} AND file_hash = ${fileHash}
  `;
  if (dup.length > 0) {
    const err = new Error("同一内容のファイルが既に登録されています。");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  return ingestRows({
    sql,
    dataSourceId: input.dataSourceId,
    rows,
    fileName: deriveFileName(finalUrl, format),
    fileHash,
    jobType: "manual_fetch",
    originalUrl: finalUrl,
    fileFormat: format,
    extraErrorRows,
  });
}
