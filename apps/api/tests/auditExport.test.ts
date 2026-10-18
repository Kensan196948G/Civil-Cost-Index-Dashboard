import { describe, expect, it } from "vitest";
import {
  AUDIT_EXPORT_MAX_ROWS,
  buildOperationAuditCsv,
  escapeSpreadsheetFormula,
  listOperationAudit,
  listOperationAuditForExport,
  parseAuditExportQuery,
  parseStrictIsoDateTime,
  type OperationAuditRow,
} from "../src/services/opsAudit";
import type { Sql } from "../src/lib/db";

const baseRow: OperationAuditRow = {
  id: "11111111-2222-3333-4444-555555555555",
  actor_email: "taro@example.com",
  actor_role: "system_admin",
  action: "user.create",
  resource_type: "user",
  resource_id: "u1",
  detail: { email: "taro@example.com" },
  ip_address: null,
  created_at: "2026-10-18T11:53:33+09",
  created_at_jst: "2026-10-18 11:53:33",
};

function captureSql(rows: OperationAuditRow[] = []): { sql: Sql; calls: Array<{ text: string; params: unknown[] }> } {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fn = ((first: TemplateStringsArray | string, ...rest: unknown[]) => {
    if (typeof first === "string") {
      calls.push({ text: first, params: (rest[0] as unknown[]) ?? [] });
    } else {
      calls.push({ text: Array.from(first).join("?"), params: rest });
    }
    return Promise.resolve(rows);
  }) as unknown as Sql;
  return { sql: fn, calls };
}

describe("parseAuditExportQuery", () => {
  it("keeps the export limit at 5000 (regression guard)", () => {
    // 一覧用の500へ誤って揃えると監査証跡が無言で欠落するため、契約値を固定する。
    expect(AUDIT_EXPORT_MAX_ROWS).toBe(5000);
  });

  it("applies the default limit and no filters", () => {
    const parsed = parseAuditExportQuery({});
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.filters.limit).toBe(AUDIT_EXPORT_MAX_ROWS);
    expect(parsed.filters.actor).toBeUndefined();
    expect(parsed.filters.from).toBeUndefined();
  });

  it("accepts actor/action/from/to and a valid limit", () => {
    const parsed = parseAuditExportQuery({
      actor: " taro@example.com ",
      action: "user.create",
      from: "2026-10-01T00:00:00+09:00",
      to: "2026-10-18T00:00:00+09:00",
      limit: "200",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.filters).toMatchObject({ actor: "taro@example.com", action: "user.create", limit: 200 });
    expect(parsed.filters.from).toBe("2026-09-30T15:00:00.000Z");
    expect(parsed.filters.to).toBe("2026-10-17T15:00:00.000Z");
  });

  it("interprets a date-only bound as JST midnight", () => {
    const parsed = parseAuditExportQuery({ from: "2026-10-01" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.filters.from).toBe("2026-09-30T15:00:00.000Z");
  });

  it.each(["0", "5001", "1.5", "abc"])("rejects an invalid limit: %s", (limit) => {
    const parsed = parseAuditExportQuery({ limit });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain("limit");
  });

  it("rejects a non ISO-8601 bound", () => {
    const parsed = parseAuditExportQuery({ from: "2026/10/01" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a datetime without an explicit timezone offset", () => {
    // 実行環境（Workers=UTC / LAN=JST）による9時間ずれを防ぐため、オフセットを必須とする。
    expect(parseAuditExportQuery({ from: "2026-10-01T00:00:00" }).ok).toBe(false);
    expect(parseStrictIsoDateTime("2026-10-01T00:00:00")).toBeNull();
  });

  it("rejects out-of-range calendar dates instead of rolling them over", () => {
    expect(parseStrictIsoDateTime("2026-02-30")).toBeNull();
    expect(parseStrictIsoDateTime("2026-13-01")).toBeNull();
    expect(parseStrictIsoDateTime("2026-10-01T24:00:00+09:00")).toBeNull();
    expect(parseAuditExportQuery({ from: "2026-02-30" }).ok).toBe(false);
  });

  it("accepts leap day and explicit offsets", () => {
    expect(parseStrictIsoDateTime("2028-02-29")?.toISOString()).toBe("2028-02-28T15:00:00.000Z");
    expect(parseStrictIsoDateTime("2026-10-01T00:00:00Z")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("rejects to <= from because to is exclusive", () => {
    const parsed = parseAuditExportQuery({
      from: "2026-10-18T00:00:00+09:00",
      to: "2026-10-18T00:00:00+09:00",
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain("to");
  });
});

describe("listOperationAuditForExport", () => {
  it("keeps the existing list endpoint shape (500 rows, default 100, no JST column)", async () => {
    const { sql, calls } = captureSql();
    await listOperationAudit(sql);
    expect(calls[0].params).toEqual([100]);
    expect(calls[0].text).toContain("LIMIT $1");
    expect(calls[0].text).not.toContain("created_at_jst");
  });

  it("uses the export limit (5000), not the list limit (500)", async () => {
    const { sql, calls } = captureSql();
    await listOperationAuditForExport(sql);
    expect(calls[0].params).toEqual([AUDIT_EXPORT_MAX_ROWS]);
    expect(calls[0].text).not.toContain("WHERE");
    expect(calls[0].text).toContain("LIMIT $1");
  });

  it("builds parameterized conditions and keeps the limit last", async () => {
    const { sql, calls } = captureSql();
    await listOperationAuditForExport(sql, {
      actor: "a@example.com",
      action: "user.create",
      from: "2026-09-30T15:00:00.000Z",
      to: "2026-10-17T15:00:00.000Z",
      limit: 200,
    });
    const call = calls[0];
    expect(call.params).toEqual([
      "a@example.com",
      "user.create",
      "2026-09-30T15:00:00.000Z",
      "2026-10-17T15:00:00.000Z",
      200,
    ]);
    expect(call.text).toContain("actor_email = $1");
    expect(call.text).toContain("action = $2");
    expect(call.text).toContain("created_at >= $3::timestamptz");
    expect(call.text).toContain("created_at < $4::timestamptz");
    expect(call.text).toContain("LIMIT $5");
    expect(call.text).toContain("ORDER BY created_at DESC, id DESC");
    expect(call.text).toContain("created_at_jst");
  });

  it("does not interpolate user input into the SQL text", async () => {
    const malicious = "x' OR 1=1 --";
    const { sql, calls } = captureSql();
    await listOperationAuditForExport(sql, { actor: malicious });
    expect(calls[0].params[0]).toBe(malicious);
    expect(calls[0].text).not.toContain(malicious);
  });

  it("clamps a limit that bypasses the query validation", async () => {
    const { sql, calls } = captureSql();
    await listOperationAuditForExport(sql, { limit: 999999 });
    expect(calls[0].params).toEqual([AUDIT_EXPORT_MAX_ROWS]);
  });
});

describe("escapeSpreadsheetFormula", () => {
  it("neutralizes formula-like values", () => {
    expect(escapeSpreadsheetFormula("=1+1")).toBe("'=1+1");
    expect(escapeSpreadsheetFormula("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeSpreadsheetFormula("@cmd")).toBe("'@cmd");
    expect(escapeSpreadsheetFormula("\tX")).toBe("'\tX");
    expect(escapeSpreadsheetFormula("\rX")).toBe("'\rX");
    expect(escapeSpreadsheetFormula("\nX")).toBe("'\nX");
    expect(escapeSpreadsheetFormula("-foo")).toBe("'-foo");
  });

  it("leaves plain text, emails and numeric values untouched", () => {
    expect(escapeSpreadsheetFormula("taro@example.com")).toBe("taro@example.com");
    expect(escapeSpreadsheetFormula("-0.1")).toBe("-0.1");
    expect(escapeSpreadsheetFormula("+81")).toBe("+81");
    expect(escapeSpreadsheetFormula("1e-3")).toBe("1e-3");
    expect(escapeSpreadsheetFormula("user.create")).toBe("user.create");
  });
});

describe("buildOperationAuditCsv", () => {
  const csvOf = (rows: OperationAuditRow[]) => buildOperationAuditCsv(rows);

  it("starts with a UTF-8 BOM and emits the header with CRLF between rows", () => {
    const csv = csvOf([]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("日時(JST),操作者,役割,操作,対象種別,対象ID,詳細,監査ID");
    // 既存 toCsv の仕様（末尾改行なし）を前提に、データ行がある場合のみ CRLF で区切る。
    expect(csv).not.toContain("\r\n");
    expect(csvOf([baseRow])).toContain("\r\n");
    expect(csv).not.toContain("IPアドレス");
  });

  it("emits deterministic rows including the audit id", () => {
    const csv1 = csvOf([baseRow]);
    const csv2 = csvOf([baseRow]);
    expect(csv1).toBe(csv2);
    expect(csv1).toContain(baseRow.id);
    expect(csv1).toContain("2026-10-18 11:53:33");
    expect(csv1).toContain('{""email"":""taro@example.com""}');
  });

  it("quotes RFC4180 special characters inside a single cell", () => {
    const csv = csvOf([
      { ...baseRow, actor_role: 'a,"b"', action: "line1\r\nline2", resource_id: null, detail: null },
    ]);
    // 引用符・カンマ・改行を含むセルは1セルとして引用される
    expect(csv).toContain('"a,""b"""');
    expect(csv).toContain('"line1\r\nline2"');
  });

  it("renders null values as empty cells", () => {
    const csv = csvOf([{ ...baseRow, actor_role: null, resource_type: null, resource_id: null, detail: null }]);
    expect(csv).toContain(`${baseRow.action},,,,`);
  });

  it("neutralizes formula injection while keeping negative numbers intact", () => {
    const csv = csvOf([
      { ...baseRow, actor_email: "=1+1", resource_id: "-0.1", action: "@SUM(A1)" },
    ]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("-0.1");
    expect(csv).not.toContain("'-0.1");
    expect(csv).toContain("'@SUM(A1)");
  });

  it("falls back to the ISO created_at when the JST column is absent", () => {
    const csv = csvOf([{ ...baseRow, created_at_jst: undefined }]);
    expect(csv).toContain(baseRow.created_at);
  });
});
