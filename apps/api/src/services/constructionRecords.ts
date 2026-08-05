import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Identity } from "../lib/auth";
import type { CsvRow } from "../lib/csv";

export const constructionRecordSchema = z.object({
  project_id: z.string().optional().nullable(),
  item_id: z.string().optional().nullable(),
  region_id: z.string().optional().nullable(),
  work_date: z.string().min(1),
  quantity: z.number().nonnegative(),
  amount: z.number().nonnegative(),
  unit: z.string().max(30).optional().nullable(),
  supplier_name: z.string().max(200).optional().nullable(),
  source_note: z.string().optional().nullable(),
});

function headerValue(row: CsvRow, keys: string[]): string {
  for (const k of keys) {
    const found = Object.entries(row).find(([key]) => key.trim().toLowerCase() === k.toLowerCase());
    if (found && found[1] !== undefined && String(found[1]).trim() !== "") return String(found[1]).trim();
  }
  return "";
}

export async function importConstructionRecords(
  sql: Sql,
  input: { rows: CsvRow[]; identity: Identity }
) {
  const { rows, identity } = input;
  const items = await sql`SELECT id, item_code, item_name FROM items WHERE is_active = true`;
  const regions = await sql`SELECT id, region_code, region_name FROM regions WHERE is_active = true`;
  const itemByCode = new Map(items.map((i) => [String(i.item_code), i]));
  const itemByName = new Map(items.map((i) => [String(i.item_name), i]));
  const regionByCode = new Map(regions.map((r) => [String(r.region_code), r]));
  const errors: Array<{ row: number; column: string; reason: string }> = [];
  let imported = 0;
  for (const [i, row] of rows.entries()) {
    const rowNo = i + 2;
    const itemRef = headerValue(row, ["item_code", "品目コード", "item_name", "品目"]);
    const regionRef = headerValue(row, ["region_code", "地域コード", "地域"]);
    const workDate = headerValue(row, ["work_date", "施工日", "年月"]);
    const quantity = Number(headerValue(row, ["quantity", "数量"]));
    const amount = Number(headerValue(row, ["amount", "金額", "実績金額"]));
    const item = itemByCode.get(itemRef) ?? itemByName.get(itemRef) ?? null;
    if (!item || !workDate || !Number.isFinite(quantity) || !Number.isFinite(amount)) {
      errors.push({ row: rowNo, column: "実績", reason: "品目・施工日・数量・金額が不正です" });
      continue;
    }
    const region = regionRef ? (regionByCode.get(regionRef) ?? null) : null;
    const unit = headerValue(row, ["unit", "単位"]) || item.default_unit || null;
    const unitPrice = quantity > 0 ? amount / quantity : 0;
    await sql`
      INSERT INTO construction_records
        (item_id, region_id, work_date, quantity, amount, unit, unit_price,
         supplier_name, source_note, created_by)
      VALUES
        (${item.id}, ${region?.id ?? null}, ${workDate}::date, ${quantity}, ${amount},
         ${unit}, ${unitPrice}, ${headerValue(row, ["supplier_name", "業者"]) || null},
         ${headerValue(row, ["source_note", "備考"]) || null}, ${identity.email})
    `;
    imported++;
  }
  return { imported, errors };
}

export async function listConstructionRecords(
  sql: Sql,
  filters: { item_id?: string; region_id?: string; project_id?: string } = {}
) {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.item_id) {
    params.push(filters.item_id);
    conds.push(`cr.item_id = $${params.length}`);
  }
  if (filters.region_id) {
    params.push(filters.region_id);
    conds.push(`cr.region_id = $${params.length}`);
  }
  if (filters.project_id) {
    params.push(filters.project_id);
    conds.push(`cr.project_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await sql(
    `
      SELECT cr.id, cr.project_id, p.name AS project_name, cr.item_id, i.item_code, i.item_name,
             cr.region_id, r.region_name, cr.work_date, cr.quantity, cr.amount,
             cr.unit, cr.unit_price, cr.supplier_name, cr.source_note, cr.created_by,
             to_char(cr.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
      FROM construction_records cr
      JOIN items i ON i.id = cr.item_id
      LEFT JOIN regions r ON r.id = cr.region_id
      LEFT JOIN projects p ON p.id = cr.project_id
      ${where}
      ORDER BY cr.work_date DESC
      LIMIT 500
    `,
    params
  );
  return rows.map((r) => ({ ...r, quantity: Number(r.quantity), amount: Number(r.amount), unit_price: Number(r.unit_price) }));
}

export async function createConstructionRecord(
  sql: Sql,
  input: z.infer<typeof constructionRecordSchema>,
  identity: Identity
) {
  if (!input.item_id) {
    const err = new Error("item_id が必要です。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const unitPrice = input.quantity > 0 ? input.amount / input.quantity : 0;
  const [row] = await sql`
    INSERT INTO construction_records
      (project_id, item_id, region_id, work_date, quantity, amount, unit, unit_price,
       supplier_name, source_note, created_by)
    VALUES
      (${input.project_id ?? null}, ${input.item_id}, ${input.region_id ?? null},
       ${input.work_date}::date, ${input.quantity}, ${input.amount},
       ${input.unit ?? null}, ${unitPrice}, ${input.supplier_name ?? null},
       ${input.source_note ?? null}, ${identity.email})
    RETURNING id
  `;
  return row.id;
}

export async function deleteConstructionRecord(sql: Sql, id: string) {
  const [row] = await sql`DELETE FROM construction_records WHERE id = ${id} RETURNING id`;
  return row ?? null;
}

export async function constructionSummary(
  sql: Sql,
  filters: { item_id?: string; region_id?: string } = {}
) {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.item_id) {
    params.push(filters.item_id);
    conds.push(`item_id = $${params.length}`);
  }
  if (filters.region_id) {
    params.push(filters.region_id);
    conds.push(`region_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await sql(
    `
      SELECT item_id, i.item_code, i.item_name, region_id, r.region_name, unit,
             count(*)::int AS record_count,
             round(avg(unit_price)::numeric, 2) AS avg_unit_price,
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price)::numeric, 2) AS median_unit_price,
             round(min(unit_price)::numeric, 2) AS min_unit_price,
             round(max(unit_price)::numeric, 2) AS max_unit_price
      FROM construction_records cr
      JOIN items i ON i.id = cr.item_id
      LEFT JOIN regions r ON r.id = cr.region_id
      ${where}
      GROUP BY item_id, i.item_code, i.item_name, region_id, r.region_name, unit
      ORDER BY i.item_code
    `,
    params
  );
  return rows;
}

export async function suggestPriceVersionFromRecords(
  sql: Sql,
  input: { item_id: string; region_id?: string | null; data_source_id?: string | null },
  identity: Identity
) {
  const summaryRows = await constructionSummary(sql, { item_id: input.item_id, region_id: input.region_id ?? undefined });
  if (summaryRows.length === 0) {
    const err = new Error("対象の施工実績がありません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const s = summaryRows[0];
  const dataSourceId = input.data_source_id ?? (await sql`SELECT id FROM data_sources WHERE source_code = 'SAMPLE_MATERIAL' LIMIT 1`)[0]?.id;
  const [version] = await sql`
    INSERT INTO price_versions
      (data_source_id, item_id, region_id, version_label, value, unit,
       effective_start, status, note, created_by)
    VALUES
      (${dataSourceId ?? null}, ${input.item_id}, ${input.region_id ?? null},
       '施工実績から作成', ${Number(s.median_unit_price)},
       ${s.unit ?? "円"}, ${new Date().toISOString().slice(0, 10)}::date,
       'draft', ${`施工実績 ${s.record_count}件の中央値（平均 ${s.avg_unit_price} / 範囲 ${s.min_unit_price}〜${s.max_unit_price}）`},
       ${identity.email})
    RETURNING id
  `;
  return { price_version_id: version.id, summary: s };
}
