import type { Sql } from "../lib/db";
import { toCsv } from "../lib/csv";

export const AUDIT_LIST_MAX_ROWS = 500;
export const AUDIT_EXPORT_MAX_ROWS = 5000;

const LIST_SELECT_COLUMNS = `
  id, actor_email, actor_role, action, resource_type, resource_id,
  detail, ip_address,
  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
`;

const EXPORT_SELECT_COLUMNS = `
  id, actor_email, actor_role, action, resource_type, resource_id,
  detail, ip_address,
  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
  to_char(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') AS created_at_jst
`;

export type OperationAuditRow = {
  id: string;
  actor_email: string;
  actor_role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  detail: unknown;
  ip_address: string | null;
  created_at: string;
  /** エクスポート用SELECTでのみ返る（JST壁時計）。 */
  created_at_jst?: string;
};

export type OperationAuditExportFilters = {
  actor?: string;
  action?: string;
  /** 開始日時（この時刻を含む）。ISO 8601。日付のみの場合は JST 00:00:00 として解釈する。 */
  from?: string;
  /** 終了日時（この時刻を含まない・排他）。ISO 8601。日付のみの場合は JST 00:00:00 として解釈する。 */
  to?: string;
  limit?: number;
};

export type AuditExportQuery = {
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: string;
};

export type AuditExportParseResult =
  | { ok: true; filters: OperationAuditExportFilters }
  | { ok: false; message: string };

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * 日付・日時を厳密に解釈する。
 * - 日付のみ（YYYY-MM-DD）は画面表示と同じ Asia/Tokyo の 00:00:00 として扱う。
 * - 日時はタイムゾーンオフセット（Z / ±hh:mm）を必須とし、実行環境のTZによる9時間ずれを防ぐ。
 * - 2026-02-30 のような存在しない日付や 24:00 のような不正時刻はロールオーバーさせず拒否する。
 */
export function parseStrictIsoDateTime(value: string): Date | null {
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
    return new Date(`${value}T00:00:00+09:00`);
  }

  const withOffset = DATE_TIME_WITH_OFFSET.exec(value);
  if (!withOffset) return null;
  const year = Number(withOffset[1]);
  const month = Number(withOffset[2]);
  const day = Number(withOffset[3]);
  const hour = Number(withOffset[4]);
  const minute = Number(withOffset[5]);
  const second = Number(withOffset[6] ?? "0");
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 監査CSVエクスポートのクエリを検証する。
 * 期間は from（含む）・to（含まない）の半開区間。
 */
export function parseAuditExportQuery(query: AuditExportQuery): AuditExportParseResult {
  const actor = query.actor?.trim() || undefined;
  const action = query.action?.trim() || undefined;

  let limit = AUDIT_EXPORT_MAX_ROWS;
  if (query.limit != null && query.limit !== "") {
    const raw = Number(query.limit);
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1 || raw > AUDIT_EXPORT_MAX_ROWS) {
      return { ok: false, message: `limit は 1〜${AUDIT_EXPORT_MAX_ROWS} の整数で指定してください。` };
    }
    limit = raw;
  }

  const parseBound = (label: "from" | "to", value?: string): string | null | { error: string } => {
    if (value == null || value === "") return null;
    const trimmed = value.trim();
    const date = parseStrictIsoDateTime(trimmed);
    if (!date) {
      return {
        error: `${label} は YYYY-MM-DD（JST）またはオフセット付き ISO 8601（例 2026-10-01T00:00:00+09:00）で指定してください。`,
      };
    }
    return date.toISOString();
  };

  const from = parseBound("from", query.from);
  if (from != null && typeof from === "object") return { ok: false, message: from.error };
  const to = parseBound("to", query.to);
  if (to != null && typeof to === "object") return { ok: false, message: to.error };
  if (from && to && new Date(to).getTime() <= new Date(from).getTime()) {
    return { ok: false, message: "to は from より後の日時を指定してください（to は排他です）。" };
  }

  return { ok: true, filters: { actor, action, from: from ?? undefined, to: to ?? undefined, limit } };
}

/** 監査ログの一覧（管理画面用・最大500件・既定100件）。既存レスポンス形状を維持する。 */
export async function listOperationAudit(
  sql: Sql,
  filters: { actor?: string; action?: string; limit?: number } = {}
) {
  return queryAuditLogs(sql, filters, LIST_SELECT_COLUMNS, AUDIT_LIST_MAX_ROWS, 100);
}

/**
 * 監査ログのエクスポート用一覧（最大5000件・期間指定可・既定5000件）。
 * 一覧用の500件上限とは独立しており、無言で打ち切らない。
 */
export async function listOperationAuditForExport(
  sql: Sql,
  filters: OperationAuditExportFilters = {}
): Promise<OperationAuditRow[]> {
  return queryAuditLogs(sql, filters, EXPORT_SELECT_COLUMNS, AUDIT_EXPORT_MAX_ROWS, AUDIT_EXPORT_MAX_ROWS);
}

async function queryAuditLogs(
  sql: Sql,
  filters: { actor?: string; action?: string; from?: string; to?: string; limit?: number },
  columns: string,
  maxRows: number,
  defaultLimit: number
): Promise<OperationAuditRow[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.actor) {
    params.push(filters.actor);
    conds.push(`actor_email = $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    conds.push(`action = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conds.push(`created_at >= $${params.length}::timestamptz`);
  }
  if (filters.to) {
    params.push(filters.to);
    conds.push(`created_at < $${params.length}::timestamptz`);
  }
  const limit = Math.min(Math.max(filters.limit ?? defaultLimit, 1), maxRows);
  params.push(limit);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await sql(
    `
      SELECT ${columns}
      FROM operation_audit_logs
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `,
    params
  );
  return rows as OperationAuditRow[];
}

/**
 * CSV の数式インジェクションを防ぐ。
 * Excel/LibreOffice は引用符を剥がした後に先頭 `=`, `+`, `-`, `@`, タブ, CR/LF を数式開始と解釈するため、
 * 対象セルの先頭にシングルクォートを付与する。ただし `-0.1` のような数値表現は値の意味を壊さないよう除外する。
 */
export function escapeSpreadsheetFormula(value: string): string {
  if (!/^[=+\-@\t\r\n]/.test(value)) return value;
  if (/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return value;
  return `'${value}`;
}

function toCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return escapeSpreadsheetFormula(value);
  const json = JSON.stringify(value);
  return escapeSpreadsheetFormula(json ?? "");
}

/**
 * 監査ログを BOM 付き UTF-8 CSV（CRLF）へ変換する。
 * 日時は画面表示と揃えた JST 表記（YYYY-MM-DD HH:MM:SS）とし、監査IDで台帳と突合できるようにする。
 * ip_address は現行の recordAudit が記録していないため列に含めない（列だけ存在して常に空になるのを避ける）。
 */
export function buildOperationAuditCsv(rows: OperationAuditRow[]): string {
  const header = ["日時(JST)", "操作者", "役割", "操作", "対象種別", "対象ID", "詳細", "監査ID"];
  const body = rows.map((row) => [
    toCell(row.created_at_jst ?? row.created_at),
    toCell(row.actor_email),
    toCell(row.actor_role),
    toCell(row.action),
    toCell(row.resource_type),
    toCell(row.resource_id),
    toCell(row.detail),
    toCell(row.id),
  ]);
  return "\uFEFF" + toCsv(header, body);
}
