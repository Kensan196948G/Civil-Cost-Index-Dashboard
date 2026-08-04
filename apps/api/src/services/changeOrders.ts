import { z } from "zod";
import * as XLSX from "xlsx";
import type { Sql } from "../lib/db";
import type { Identity } from "../lib/auth";
import { computeChangeLine, summarizeChangeLines, type ChangeLineResult } from "../lib/changeOrder";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DB driver boundary
type DbRow = Record<string, any>;

export const changeOrderSchema = z.object({
  project_id: z.string().min(1),
  base_id: z.string().optional().nullable(),
  estimate_id: z.string().optional().nullable(),
  name: z.string().min(1).max(200),
  change_date: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  status: z.enum(["draft", "confirmed"]).optional(),
});

export const changeLineSchema = z.object({
  tree_id: z.string().optional().nullable(),
  tree_code: z.string().max(50).optional().nullable(),
  tree_name: z.string().max(200).optional().nullable(),
  unit: z.string().max(30).optional().nullable(),
  before_quantity: z.number().nonnegative(),
  after_quantity: z.number().nonnegative(),
  before_unit_price: z.number().nonnegative(),
  after_unit_price: z.number().nonnegative(),
  note: z.string().optional().nullable(),
});

export type ChangeOrderLineRow = ChangeLineResult & {
  id: string;
  tree_id: string | null;
  note: string | null;
};

export type ChangeOrderDetail = {
  id: string;
  project_id: string;
  project_name: string;
  base_id: string | null;
  base_code: string | null;
  estimate_id: string | null;
  name: string;
  change_date: string | null;
  reason: string | null;
  status: string;
  created_by: string;
  created_at: string;
  lines: ChangeOrderLineRow[];
  summary: { increase: number; decrease: number; net: number };
};

export async function createChangeOrder(
  sql: Sql,
  input: z.infer<typeof changeOrderSchema>,
  identity: Identity
) {
  const project = await sql`SELECT id FROM projects WHERE id = ${input.project_id}`;
  if (project.length === 0) {
    const err = new Error("案件が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const [row] = await sql`
    INSERT INTO change_orders
      (project_id, base_id, estimate_id, name, change_date, reason, status, created_by)
    VALUES
      (${input.project_id}, ${input.base_id ?? null}, ${input.estimate_id ?? null},
       ${input.name}, ${input.change_date ?? null}, ${input.reason ?? null},
       ${input.status ?? "draft"}, ${identity.email})
    RETURNING id
  `;
  return row.id;
}

export async function listChangeOrders(sql: Sql, projectId?: string) {
  const rows = projectId
    ? await sql`
        SELECT co.id, co.project_id, p.name AS project_name, co.base_id, b.base_code,
               co.estimate_id, co.name, co.change_date, co.reason, co.status, co.created_by,
               to_char(co.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
               (SELECT coalesce(sum(col.amount_diff), 0) FROM change_order_lines col WHERE col.change_order_id = co.id) AS net_diff
        FROM change_orders co
        JOIN projects p ON p.id = co.project_id
        LEFT JOIN estimation_bases b ON b.id = co.base_id
        WHERE co.project_id = ${projectId}
        ORDER BY co.created_at DESC
      `
    : await sql`
        SELECT co.id, co.project_id, p.name AS project_name, co.base_id, b.base_code,
               co.estimate_id, co.name, co.change_date, co.reason, co.status, co.created_by,
               to_char(co.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
               (SELECT coalesce(sum(col.amount_diff), 0) FROM change_order_lines col WHERE col.change_order_id = co.id) AS net_diff
        FROM change_orders co
        JOIN projects p ON p.id = co.project_id
        LEFT JOIN estimation_bases b ON b.id = co.base_id
        ORDER BY co.created_at DESC
      `;
  return rows.map((r) => ({ ...r, net_diff: Number(r.net_diff) }));
}

export async function getChangeOrder(sql: Sql, id: string): Promise<ChangeOrderDetail | null> {
  const [header] = (await sql`
    SELECT co.id, co.project_id, p.name AS project_name, co.base_id, b.base_code,
           co.estimate_id, co.name, co.change_date, co.reason, co.status, co.created_by,
           to_char(co.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
    FROM change_orders co
    JOIN projects p ON p.id = co.project_id
    LEFT JOIN estimation_bases b ON b.id = co.base_id
    WHERE co.id = ${id}
  `) as DbRow[];
  if (!header) return null;
  const lines = (await sql`
    SELECT id, tree_id, tree_code, tree_name, unit,
           before_quantity, after_quantity, before_unit_price, after_unit_price,
           quantity_diff, amount_diff, note
    FROM change_order_lines
    WHERE change_order_id = ${id}
    ORDER BY created_at
  `) as DbRow[];
  const mapped = lines.map((l) => ({
    ...l,
    before_quantity: Number(l.before_quantity),
    after_quantity: Number(l.after_quantity),
    before_unit_price: Number(l.before_unit_price),
    after_unit_price: Number(l.after_unit_price),
    quantity_diff: Number(l.quantity_diff),
    amount_diff: Number(l.amount_diff),
  })) as ChangeLineResult[];
  return {
    ...header,
    lines: mapped as ChangeOrderLineRow[],
    summary: summarizeChangeLines(mapped),
  } as ChangeOrderDetail;
}

export async function addChangeOrderLine(
  sql: Sql,
  changeOrderId: string,
  input: z.infer<typeof changeLineSchema>
) {
  const co = await sql`SELECT id FROM change_orders WHERE id = ${changeOrderId}`;
  if (co.length === 0) {
    const err = new Error("変更契約が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const line = computeChangeLine({
    tree_code: input.tree_code ?? "",
    tree_name: input.tree_name ?? "（未設定）",
    unit: input.unit ?? "",
    before_quantity: input.before_quantity,
    after_quantity: input.after_quantity,
    before_unit_price: input.before_unit_price,
    after_unit_price: input.after_unit_price,
  });
  const [row] = await sql`
    INSERT INTO change_order_lines
      (change_order_id, tree_id, tree_code, tree_name, unit,
       before_quantity, after_quantity, before_unit_price, after_unit_price,
       quantity_diff, amount_diff, note)
    VALUES
      (${changeOrderId}, ${input.tree_id ?? null}, ${line.tree_code}, ${line.tree_name},
       ${line.unit}, ${line.before_quantity}, ${line.after_quantity},
       ${line.before_unit_price}, ${line.after_unit_price},
       ${line.quantity_diff}, ${line.amount_diff}, ${input.note ?? null})
    RETURNING id
  `;
  return row.id;
}

export async function deleteChangeOrderLine(sql: Sql, id: string) {
  const [row] = await sql`DELETE FROM change_order_lines WHERE id = ${id} RETURNING id`;
  return row ?? null;
}

export async function deleteChangeOrder(sql: Sql, id: string) {
  const [row] = await sql`DELETE FROM change_orders WHERE id = ${id} RETURNING id`;
  return row ?? null;
}

export async function buildChangeOrderXlsx(sql: Sql, id: string): Promise<ArrayBuffer> {
  const co = await getChangeOrder(sql, id);
  if (!co) return new ArrayBuffer(0);
  const detail: (string | number)[][] = [
    ["工種コード", "工種名", "単位", "変更前数量", "変更後数量", "数量差", "変更前単価", "変更後単価", "変更前金額", "変更後金額", "増減額", "備考"],
  ];
  for (const l of co.lines) {
    detail.push([
      l.tree_code,
      l.tree_name,
      l.unit,
      l.before_quantity,
      l.after_quantity,
      l.quantity_diff,
      l.before_unit_price,
      l.after_unit_price,
      l.before_quantity * l.before_unit_price,
      l.after_quantity * l.after_unit_price,
      l.amount_diff,
      l.note ?? "",
    ]);
  }
  const summary: (string | number)[][] = [
    ["項目", "金額（円）"],
    ["増額分", co.summary.increase],
    ["減額分", co.summary.decrease],
    ["差額（増減合計）", co.summary.net],
    ["", ""],
    ["案件", co.project_name],
    ["変更名称", co.name],
    ["変更日", co.change_date ?? ""],
    ["積算基準", co.base_code ?? "—"],
    ["理由", co.reason ?? ""],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "差額集計");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), "変更明細");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as ArrayBuffer;
}
