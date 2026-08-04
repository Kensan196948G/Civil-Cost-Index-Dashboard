import { z } from "zod";
import * as XLSX from "xlsx";
import type { Sql } from "../lib/db";
import type { Identity } from "../lib/auth";
import {
  compareQuoteItems,
  quoteExpiryStatus,
  type QuoteComparisonRow,
  type QuoteItemInput,
} from "../lib/quotations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DB driver boundary
type DbRow = Record<string, any>;

export const quotationSchema = z.object({
  project_id: z.string().min(1),
  supplier_name: z.string().min(1).max(200),
  quote_date: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  status: z.enum(["draft", "submitted", "selected", "rejected"]).optional(),
  tax_inclusive: z.boolean().optional(),
  freight_included: z.boolean().optional(),
  conditions_json: z.record(z.unknown()).optional(),
  note: z.string().optional().nullable(),
});

export const quotationPatchSchema = quotationSchema.partial();

export const quotationItemSchema = z.object({
  item_id: z.string().optional().nullable(),
  tree_id: z.string().optional().nullable(),
  item_name: z.string().min(1).max(200),
  standard_name: z.string().max(200).optional().nullable(),
  unit: z.string().max(30).optional().nullable(),
  unit_price: z.number().nonnegative(),
  is_adopted: z.boolean().optional(),
  adoption_reason: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export const quotationItemPatchSchema = quotationItemSchema.partial();

export type QuotationDetail = {
  id: string;
  project_id: string;
  project_name: string;
  supplier_name: string;
  quote_date: string;
  valid_until: string | null;
  status: string;
  tax_inclusive: boolean;
  freight_included: boolean;
  conditions_json: Record<string, unknown>;
  note: string | null;
  created_by: string;
  created_at: string;
  expiry: { expired: boolean; expiring_soon: boolean; days_left: number | null };
  items: Array<Record<string, unknown> & QuoteComparisonRow>;
  comparison: QuoteComparisonRow[];
};

function itemKey(row: DbRow): string {
  if (row.item_id) return `item:${row.item_id}`;
  if (row.tree_id) return `tree:${row.tree_id}`;
  return `name:${row.item_name}`;
}

export async function createQuotation(
  sql: Sql,
  input: z.infer<typeof quotationSchema>,
  identity: Identity
) {
  const project = await sql`SELECT id FROM projects WHERE id = ${input.project_id}`;
  if (project.length === 0) {
    const err = new Error("案件が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const [row] = await sql`
    INSERT INTO quotations
      (project_id, supplier_name, quote_date, valid_until, status,
       tax_inclusive, freight_included, conditions_json, note, created_by)
    VALUES
      (${input.project_id}, ${input.supplier_name},
       ${input.quote_date ?? new Date().toISOString().slice(0, 10)},
       ${input.valid_until ?? null}, ${input.status ?? "submitted"},
       ${input.tax_inclusive ?? false}, ${input.freight_included ?? false},
       ${JSON.stringify(input.conditions_json ?? {})}, ${input.note ?? null}, ${identity.email})
    RETURNING id
  `;
  return row.id;
}

export async function listQuotations(sql: Sql, projectId?: string) {
  const rows = projectId
    ? await sql`
        SELECT q.id, q.project_id, p.name AS project_name, q.supplier_name, q.quote_date,
               q.valid_until, q.status, q.tax_inclusive, q.freight_included,
               q.conditions_json, q.note, q.created_by,
               to_char(q.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
               (SELECT count(*)::int FROM quotation_items qi WHERE qi.quotation_id = q.id) AS item_count
        FROM quotations q
        JOIN projects p ON p.id = q.project_id
        WHERE q.project_id = ${projectId}
        ORDER BY q.quote_date DESC, q.created_at DESC
      `
    : await sql`
        SELECT q.id, q.project_id, p.name AS project_name, q.supplier_name, q.quote_date,
               q.valid_until, q.status, q.tax_inclusive, q.freight_included,
               q.conditions_json, q.note, q.created_by,
               to_char(q.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
               (SELECT count(*)::int FROM quotation_items qi WHERE qi.quotation_id = q.id) AS item_count
        FROM quotations q
        JOIN projects p ON p.id = q.project_id
        ORDER BY q.quote_date DESC, q.created_at DESC
      `;
  return rows.map((r) => ({ ...r, expiry: quoteExpiryStatus(r.valid_until) }));
}

export async function getQuotation(sql: Sql, id: string): Promise<QuotationDetail | null> {
  const [header] = (await sql`
    SELECT q.id, q.project_id, p.name AS project_name, q.supplier_name, q.quote_date,
           q.valid_until, q.status, q.tax_inclusive, q.freight_included,
           q.conditions_json, q.note, q.created_by,
           to_char(q.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
    FROM quotations q
    JOIN projects p ON p.id = q.project_id
    WHERE q.id = ${id}
  `) as DbRow[];
  if (!header) return null;
  const items = (await sql`
    SELECT qi.id, qi.quotation_id, qi.item_id, qi.tree_id, qi.item_name,
           qi.standard_name, qi.unit, qi.unit_price, qi.is_adopted,
           qi.adoption_reason, qi.note, qi.created_at
    FROM quotation_items qi
    WHERE qi.quotation_id = ${id}
    ORDER BY qi.created_at
  `) as DbRow[];
  const allProjectItems = (await sql`
    SELECT qi.item_id, qi.tree_id, qi.item_name, qi.standard_name, qi.unit,
           qi.unit_price, q.supplier_name, q.quote_date
    FROM quotation_items qi
    JOIN quotations q ON q.id = qi.quotation_id
    WHERE q.project_id = ${header.project_id}
    ORDER BY q.quote_date, q.created_at
  `) as DbRow[];
  const previousRows = (await sql`
    SELECT qi.item_id, qi.tree_id, qi.item_name, qi.unit_price, q.quote_date, q.supplier_name
    FROM quotation_items qi
    JOIN quotations q ON q.id = qi.quotation_id
    WHERE q.supplier_name = ${header.supplier_name}
      AND (q.quote_date < ${header.quote_date} OR (q.quote_date = ${header.quote_date} AND q.created_at < ${header.created_at}))
    ORDER BY q.quote_date DESC, q.created_at DESC
  `) as DbRow[];
  const previousByKey = new Map<string, number>();
  for (const row of previousRows) {
    const key = `${row.supplier_name}|${itemKey(row)}`;
    if (!previousByKey.has(key)) previousByKey.set(key, Number(row.unit_price));
  }
  const comparison = compareQuoteItems(
    allProjectItems.map((row) => ({
      key: itemKey(row),
      item_name: String(row.item_name),
      standard_name: row.standard_name ? String(row.standard_name) : null,
      unit: row.unit ? String(row.unit) : null,
      unit_price: Number(row.unit_price),
      supplier_name: String(row.supplier_name),
      quote_date: String(row.quote_date),
    })) as QuoteItemInput[],
    previousByKey
  );
  const comparisonByKey = new Map(comparison.map((c) => [`${c.supplier_name}|${c.key}`, c]));
  const mappedItems = items.map((row) => {
    const cmp = comparisonByKey.get(`${header.supplier_name}|${itemKey(row)}`);
    return {
      ...row,
      unit_price: Number(row.unit_price),
      ...(cmp ?? {}),
    };
  });
  return {
    ...header,
    expiry: quoteExpiryStatus(header.valid_until),
    items: mappedItems,
    comparison,
  } as QuotationDetail;
}

export async function updateQuotation(
  sql: Sql,
  id: string,
  input: z.infer<typeof quotationPatchSchema>
) {
  const cur = await sql`SELECT * FROM quotations WHERE id = ${id}`;
  if (cur.length === 0) return null;
  const c = cur[0];
  await sql`
    UPDATE quotations SET
      supplier_name = ${input.supplier_name ?? c.supplier_name},
      quote_date = ${input.quote_date ?? c.quote_date},
      valid_until = ${input.valid_until !== undefined ? input.valid_until : c.valid_until},
      status = ${input.status ?? c.status},
      tax_inclusive = ${input.tax_inclusive ?? c.tax_inclusive},
      freight_included = ${input.freight_included ?? c.freight_included},
      conditions_json = ${JSON.stringify(input.conditions_json ?? c.conditions_json)},
      note = ${input.note !== undefined ? input.note : c.note},
      updated_at = now()
    WHERE id = ${id}
  `;
  return id;
}

export async function addQuotationItem(
  sql: Sql,
  quotationId: string,
  input: z.infer<typeof quotationItemSchema>
) {
  const q = await sql`SELECT id FROM quotations WHERE id = ${quotationId}`;
  if (q.length === 0) {
    const err = new Error("見積が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const [row] = await sql`
    INSERT INTO quotation_items
      (quotation_id, item_id, tree_id, item_name, standard_name, unit, unit_price,
       is_adopted, adoption_reason, note)
    VALUES
      (${quotationId}, ${input.item_id ?? null}, ${input.tree_id ?? null},
       ${input.item_name}, ${input.standard_name ?? null}, ${input.unit ?? null},
       ${input.unit_price}, ${input.is_adopted ?? false},
       ${input.adoption_reason ?? null}, ${input.note ?? null})
    RETURNING id
  `;
  return row.id;
}

export async function updateQuotationItem(
  sql: Sql,
  id: string,
  input: z.infer<typeof quotationItemPatchSchema>
) {
  const cur = await sql`SELECT * FROM quotation_items WHERE id = ${id}`;
  if (cur.length === 0) return null;
  const c = cur[0];
  await sql`
    UPDATE quotation_items SET
      item_id = ${input.item_id !== undefined ? input.item_id : c.item_id},
      tree_id = ${input.tree_id !== undefined ? input.tree_id : c.tree_id},
      item_name = ${input.item_name ?? c.item_name},
      standard_name = ${input.standard_name !== undefined ? input.standard_name : c.standard_name},
      unit = ${input.unit !== undefined ? input.unit : c.unit},
      unit_price = ${input.unit_price ?? c.unit_price},
      is_adopted = ${input.is_adopted ?? c.is_adopted},
      adoption_reason = ${input.adoption_reason !== undefined ? input.adoption_reason : c.adoption_reason},
      note = ${input.note !== undefined ? input.note : c.note},
      updated_at = now()
    WHERE id = ${id}
  `;
  return id;
}

export async function deleteQuotationItem(sql: Sql, id: string) {
  const [row] = await sql`DELETE FROM quotation_items WHERE id = ${id} RETURNING id`;
  return row ?? null;
}

export async function deleteQuotation(sql: Sql, id: string) {
  const [row] = await sql`DELETE FROM quotations WHERE id = ${id} RETURNING id`;
  return row ?? null;
}

export async function buildQuotationXlsx(sql: Sql, id: string): Promise<ArrayBuffer> {
  const q = await getQuotation(sql, id);
  if (!q) return new ArrayBuffer(0);
  const comparison: (string | number)[][] = [
    ["品目", "規格", "単位", "業者", "単価", "平均", "最小", "最大", "平均比(%)", "前回単価", "前回比(%)", "警告", "採用", "採用理由"],
  ];
  for (const c of q.comparison) {
    comparison.push([
      c.item_name,
      c.standard_name ?? "",
      c.unit ?? "",
      c.supplier_name,
      c.unit_price,
      c.average ?? "",
      c.min_price ?? "",
      c.max_price ?? "",
      c.deviation_rate ?? "",
      c.previous_price ?? "",
      c.previous_change_rate ?? "",
      c.warnings.join("／"),
      q.items.find((i) => i.key === c.key && i.supplier_name === c.supplier_name)?.is_adopted ? "採用" : "",
      String(q.items.find((i) => i.key === c.key && i.supplier_name === c.supplier_name)?.adoption_reason ?? ""),
    ]);
  }
  const items: (string | number)[][] = [
    ["品目", "規格", "単位", "単価", "採用", "採用理由", "備考"],
  ];
  for (const i of q.items) {
    items.push([
      i.item_name,
      i.standard_name ?? "",
      i.unit ?? "",
      i.unit_price,
      i.is_adopted ? "採用" : "",
      String(i.adoption_reason ?? ""),
      String(i.note ?? ""),
    ]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(comparison), "見積比較");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(items), "明細");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as ArrayBuffer;
}
