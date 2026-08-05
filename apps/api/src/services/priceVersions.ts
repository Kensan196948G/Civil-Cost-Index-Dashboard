import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Identity } from "../lib/auth";

export const priceVersionSchema = z.object({
  data_source_id: z.string().min(1),
  item_id: z.string().min(1),
  region_id: z.string().optional().nullable(),
  version_label: z.string().max(200).optional().nullable(),
  value: z.number().finite(),
  unit: z.string().min(1).max(50),
  publication_date: z.string().optional().nullable(),
  effective_start: z.string().min(1),
  effective_end: z.string().optional().nullable(),
  revised_at: z.string().optional().nullable(),
  retroactive: z.boolean().optional(),
  delivery_terms: z.string().max(200).optional().nullable(),
  tax_inclusive: z.boolean().optional(),
  freight_included: z.boolean().optional(),
  note: z.string().optional().nullable(),
  parent_version_id: z.string().optional().nullable(),
});

export const priceVersionPatchSchema = priceVersionSchema.partial();

export const snapshotSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  snapshot_date: z.string().optional(),
});

export async function listPriceVersions(
  sql: Sql,
  filters: { item_id?: string; region_id?: string; status?: string; limit?: number } = {}
) {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.item_id) {
    params.push(filters.item_id);
    conds.push(`pv.item_id = $${params.length}`);
  }
  if (filters.region_id) {
    params.push(filters.region_id);
    conds.push(`pv.region_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conds.push(`pv.status = $${params.length}`);
  }
  params.push(Math.min(Math.max(filters.limit ?? 100, 1), 500));
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await sql(
    `
      SELECT pv.id, pv.data_source_id, ds.source_name, ds.source_code,
             pv.item_id, i.item_code, i.item_name, i.data_kind, i.estimate_usable,
             pv.region_id, r.region_name, r.region_code,
             pv.version_label, pv.value, pv.unit, pv.publication_date, pv.effective_start,
             pv.effective_end, pv.revised_at, pv.retroactive, pv.delivery_terms,
             pv.tax_inclusive, pv.freight_included, pv.note, pv.status,
             pv.parent_version_id, pv.approved_by, pv.approved_at, pv.created_by,
             to_char(pv.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
             to_char(pv.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
      FROM price_versions pv
      JOIN data_sources ds ON ds.id = pv.data_source_id
      JOIN items i ON i.id = pv.item_id
      LEFT JOIN regions r ON r.id = pv.region_id
      ${where}
      ORDER BY pv.effective_start DESC, pv.created_at DESC
      LIMIT $${params.length}
    `,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    data_source_id: r.data_source_id,
    source_name: r.source_name,
    source_code: r.source_code,
    item_id: r.item_id,
    item_code: r.item_code,
    item_name: r.item_name,
    data_kind: r.data_kind,
    estimate_usable: r.estimate_usable,
    region_id: r.region_id,
    region_name: r.region_name,
    region_code: r.region_code,
    version_label: r.version_label,
    value: Number(r.value),
    unit: r.unit,
    publication_date: r.publication_date,
    effective_start: r.effective_start,
    effective_end: r.effective_end,
    revised_at: r.revised_at,
    retroactive: r.retroactive,
    delivery_terms: r.delivery_terms,
    tax_inclusive: r.tax_inclusive,
    freight_included: r.freight_included,
    note: r.note,
    status: r.status,
    parent_version_id: r.parent_version_id,
    approved_by: r.approved_by,
    approved_at: r.approved_at,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function createPriceVersion(
  sql: Sql,
  input: z.infer<typeof priceVersionSchema>,
  identity: Identity
) {
  const [row] = await sql`
    INSERT INTO price_versions
      (data_source_id, item_id, region_id, version_label, value, unit,
       publication_date, effective_start, effective_end, revised_at, retroactive,
       delivery_terms, tax_inclusive, freight_included, note, parent_version_id,
       created_by)
    VALUES
      (${input.data_source_id}, ${input.item_id}, ${input.region_id ?? null},
       ${input.version_label ?? null}, ${input.value}, ${input.unit},
       ${input.publication_date ?? null}, ${input.effective_start},
       ${input.effective_end ?? null}, ${input.revised_at ?? null},
       ${input.retroactive ?? false}, ${input.delivery_terms ?? null},
       ${input.tax_inclusive ?? false}, ${input.freight_included ?? false},
       ${input.note ?? null}, ${input.parent_version_id ?? null},
       ${identity.email})
    RETURNING id
  `;
  return row.id;
}

export async function getPriceVersion(sql: Sql, id: string) {
  const rows = await sql`
    SELECT pv.id, pv.data_source_id, ds.source_name, ds.source_code,
           pv.item_id, i.item_code, i.item_name, i.data_kind, i.estimate_usable,
           pv.region_id, r.region_name, r.region_code,
           pv.version_label, pv.value, pv.unit, pv.publication_date, pv.effective_start,
           pv.effective_end, pv.revised_at, pv.retroactive, pv.delivery_terms,
           pv.tax_inclusive, pv.freight_included, pv.note, pv.status,
           pv.parent_version_id, pv.approved_by, pv.approved_at, pv.created_by,
           to_char(pv.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
           to_char(pv.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
    FROM price_versions pv
    JOIN data_sources ds ON ds.id = pv.data_source_id
    JOIN items i ON i.id = pv.item_id
    LEFT JOIN regions r ON r.id = pv.region_id
    WHERE pv.id = ${id}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    data_source_id: r.data_source_id,
    source_name: r.source_name,
    source_code: r.source_code,
    item_id: r.item_id,
    item_code: r.item_code,
    item_name: r.item_name,
    data_kind: r.data_kind,
    estimate_usable: r.estimate_usable,
    region_id: r.region_id,
    region_name: r.region_name,
    region_code: r.region_code,
    version_label: r.version_label,
    value: Number(r.value),
    unit: r.unit,
    publication_date: r.publication_date,
    effective_start: r.effective_start,
    effective_end: r.effective_end,
    revised_at: r.revised_at,
    retroactive: r.retroactive,
    delivery_terms: r.delivery_terms,
    tax_inclusive: r.tax_inclusive,
    freight_included: r.freight_included,
    note: r.note,
    status: r.status,
    parent_version_id: r.parent_version_id,
    approved_by: r.approved_by,
    approved_at: r.approved_at,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function updatePriceVersion(
  sql: Sql,
  id: string,
  input: z.infer<typeof priceVersionPatchSchema>,
  _identity: Identity
) {
  const cur = await sql`
    SELECT status FROM price_versions WHERE id = ${id}
  `;
  if (cur.length === 0) return null;
  if (cur[0].status === "approved") {
    const err = new Error("承認済みの単価版は編集できません。失効（retired）のみ可能です。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  const fields: Array<[string, unknown]> = [
    ["data_source_id", input.data_source_id],
    ["item_id", input.item_id],
    ["region_id", input.region_id !== undefined ? input.region_id : undefined],
    ["version_label", input.version_label !== undefined ? input.version_label : undefined],
    ["value", input.value],
    ["unit", input.unit],
    ["publication_date", input.publication_date !== undefined ? input.publication_date : undefined],
    ["effective_start", input.effective_start],
    ["effective_end", input.effective_end !== undefined ? input.effective_end : undefined],
    ["revised_at", input.revised_at !== undefined ? input.revised_at : undefined],
    ["retroactive", input.retroactive],
    ["delivery_terms", input.delivery_terms !== undefined ? input.delivery_terms : undefined],
    ["tax_inclusive", input.tax_inclusive],
    ["freight_included", input.freight_included],
    ["note", input.note !== undefined ? input.note : undefined],
    ["parent_version_id", input.parent_version_id !== undefined ? input.parent_version_id : undefined],
  ];
  for (const [col, v] of fields) {
    if (v === undefined) continue;
    if (col === "region_id" || col === "parent_version_id") {
      push(col, v === null || v === "" ? null : v);
    } else if (typeof v === "string" && (col.endsWith("_date"))) {
      push(col, v === "" ? null : v);
    } else {
      push(col, v);
    }
  }
  if (sets.length === 0) return getPriceVersion(sql, id);
  params.push(id);
  await sql(
    `UPDATE price_versions SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`,
    params
  );
  return getPriceVersion(sql, id);
}

export async function approvePriceVersion(sql: Sql, id: string, identity: Identity) {
  const cur = await sql`
    SELECT status FROM price_versions WHERE id = ${id}
  `;
  if (cur.length === 0) return null;
  if (cur[0].status !== "draft") {
    const err = new Error("承認できるのは下書き（draft）のみです。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  await sql`
    UPDATE price_versions SET status = 'approved', approved_by = ${identity.email}, approved_at = now(), updated_at = now()
    WHERE id = ${id}
  `;
  return getPriceVersion(sql, id);
}

export async function retirePriceVersion(sql: Sql, id: string) {
  const cur = await sql`SELECT status FROM price_versions WHERE id = ${id}`;
  if (cur.length === 0) return null;
  if (cur[0].status === "retired") return getPriceVersion(sql, id);
  await sql`
    UPDATE price_versions SET status = 'retired', updated_at = now() WHERE id = ${id}
  `;
  return getPriceVersion(sql, id);
}

export async function deletePriceVersion(sql: Sql, id: string) {
  await sql`
    UPDATE price_snapshot_items SET price_version_id = NULL WHERE price_version_id = ${id}
  `;
  const [row] = await sql`
    DELETE FROM price_versions WHERE id = ${id} RETURNING id
  `;
  return row ?? null;
}

export async function deleteSnapshot(sql: Sql, id: string) {
  const [row] = await sql`
    DELETE FROM price_snapshots WHERE id = ${id} RETURNING id
  `;
  return row ?? null;
}

export async function comparePriceVersions(sql: Sql, id: string, oldId?: string | null) {
  const [newRow] = await sql`
    SELECT pv.*, i.item_name, i.item_code, r.region_name,
           ds.source_name, ds.data_kind, ds.estimate_usable
    FROM price_versions pv
    JOIN items i ON i.id = pv.item_id
    LEFT JOIN regions r ON r.id = pv.region_id
    JOIN data_sources ds ON ds.id = pv.data_source_id
    WHERE pv.id = ${id}
  `;
  if (!newRow) return null;
  let oldRow: typeof newRow | null = null;
  if (oldId) {
    const rows = await sql`
      SELECT pv.*, i.item_name, i.item_code, r.region_name,
             ds.source_name, ds.data_kind, ds.estimate_usable
      FROM price_versions pv
      JOIN items i ON i.id = pv.item_id
      LEFT JOIN regions r ON r.id = pv.region_id
      JOIN data_sources ds ON ds.id = pv.data_source_id
      WHERE pv.id = ${oldId}
    `;
    oldRow = rows[0] ?? null;
  } else {
    const parent = await sql`
      SELECT pv.*, i.item_name, i.item_code, r.region_name,
             ds.source_name, ds.data_kind, ds.estimate_usable
      FROM price_versions pv
      JOIN items i ON i.id = pv.item_id
      LEFT JOIN regions r ON r.id = pv.region_id
      JOIN data_sources ds ON ds.id = pv.data_source_id
      WHERE pv.parent_version_id IS NOT NULL AND pv.parent_version_id = ${id}
    `;
    if (parent.length === 0) {
      const older = await sql`
        SELECT pv.*, i.item_name, i.item_code, r.region_name,
               ds.source_name, ds.data_kind, ds.estimate_usable
        FROM price_versions pv
        JOIN items i ON i.id = pv.item_id
        LEFT JOIN regions r ON r.id = pv.region_id
        JOIN data_sources ds ON ds.id = pv.data_source_id
        WHERE pv.item_id = ${newRow.item_id}
          AND (pv.region_id IS NOT DISTINCT FROM ${newRow.region_id})
          AND pv.status = 'approved'
          AND pv.id <> ${id}
          AND pv.effective_start < ${newRow.effective_start}
        ORDER BY pv.effective_start DESC
        LIMIT 1
      `;
      oldRow = older[0] ?? null;
    } else {
      oldRow = parent[0];
    }
  }
  const diff = oldRow
    ? {
        value: { old: Number(oldRow.value), new: Number(newRow.value) },
        diff: Number(newRow.value) - Number(oldRow.value),
        diff_rate: oldRow.value ? ((Number(newRow.value) - Number(oldRow.value)) / Number(oldRow.value)) * 100 : null,
        effective_start: { old: oldRow.effective_start, new: newRow.effective_start },
        effective_end: { old: oldRow.effective_end, new: newRow.effective_end },
        tax_inclusive: { old: oldRow.tax_inclusive, new: newRow.tax_inclusive },
        freight_included: { old: oldRow.freight_included, new: newRow.freight_included },
        delivery_terms: { old: oldRow.delivery_terms, new: newRow.delivery_terms },
      }
    : null;
  return { current: newRow, previous: oldRow, diff };
}

export async function createSnapshot(
  sql: Sql,
  input: z.infer<typeof snapshotSchema>,
  identity: Identity
) {
  const snapshotDate = input.snapshot_date || new Date().toISOString().slice(0, 10);
  const versions = await sql`
    SELECT pv.id, pv.item_id, pv.region_id, pv.unit, pv.value,
           pv.effective_start, pv.effective_end, ds.source_name
    FROM price_versions pv
    JOIN data_sources ds ON ds.id = pv.data_source_id
    WHERE pv.status = 'approved'
      AND pv.effective_start <= ${snapshotDate}::date
      AND (pv.effective_end IS NULL OR pv.effective_end >= ${snapshotDate}::date)
    ORDER BY pv.item_id, pv.region_id NULLS FIRST, pv.effective_start DESC
  `;
  if (versions.length === 0) {
    const err = new Error("スナップショット時点で有効な承認済み単価版がありません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const seen = new Set<string>();
  const selected = versions.filter((v) => {
    const key = `${v.item_id}|${v.region_id ?? ""}|${v.unit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const [snap] = await sql`
    INSERT INTO price_snapshots (name, description, snapshot_date, created_by)
    VALUES (${input.name}, ${input.description ?? null}, ${snapshotDate}::date, ${identity.email})
    RETURNING id
  `;
  for (const v of selected) {
    await sql`
      INSERT INTO price_snapshot_items
        (snapshot_id, price_version_id, item_id, region_id, unit, value,
         data_source_name, effective_start, effective_end)
      VALUES
        (${snap.id}, ${v.id}, ${v.item_id}, ${v.region_id}, ${v.unit}, ${v.value},
         ${v.source_name}, ${v.effective_start}, ${v.effective_end})
    `;
  }
  return getSnapshot(sql, snap.id);
}

export type SnapshotItem = {
  id: string;
  price_version_id: string | null;
  item_id: string;
  item_code: string;
  item_name: string;
  region_id: string | null;
  region_name: string | null;
  unit: string;
  value: number;
  data_source_name: string | null;
  effective_start: string | null;
  effective_end: string | null;
};

export type Snapshot = {
  id: string;
  name: string;
  description: string | null;
  snapshot_date: string;
  created_by: string;
  created_at: string;
  items: SnapshotItem[];
};

export async function listSnapshots(sql: Sql) {
  const rows = await sql`
    SELECT s.id, s.name, s.description, s.snapshot_date, s.created_by,
           to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
           count(si.id)::int AS item_count
    FROM price_snapshots s
    LEFT JOIN price_snapshot_items si ON si.snapshot_id = s.id
    GROUP BY s.id
    ORDER BY s.snapshot_date DESC, s.created_at DESC
  `;
  return rows as Array<{
    id: string;
    name: string;
    description: string | null;
    snapshot_date: string;
    created_by: string;
    created_at: string;
    item_count: number;
  }>;
}

export async function getSnapshot(sql: Sql, id: string): Promise<Snapshot | null> {
  const [snap] = await sql`
    SELECT id, name, description, snapshot_date, created_by, created_at
    FROM price_snapshots WHERE id = ${id}
  `;
  if (!snap) return null;
  const items = await sql`
    SELECT si.id, si.price_version_id, si.item_id, i.item_code, i.item_name,
           si.region_id, r.region_name, si.unit, si.value, si.data_source_name,
           si.effective_start, si.effective_end
    FROM price_snapshot_items si
    JOIN items i ON i.id = si.item_id
    LEFT JOIN regions r ON r.id = si.region_id
    WHERE si.snapshot_id = ${id}
    ORDER BY i.item_name, r.region_name NULLS FIRST
  `;
  return {
    ...snap,
    items: items.map((it) => ({ ...it, value: Number(it.value) })) as SnapshotItem[],
  } as Snapshot;
}
