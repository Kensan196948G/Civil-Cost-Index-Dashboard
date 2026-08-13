import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Env } from "../types";
import type { Identity } from "../lib/auth";
import {
  computeEstimate,
  type BreakdownInput,
  type PortOptions,
  type ResourceItem,
  type VesselInfo,
} from "../lib/estimating";
import { generateAiText } from "../lib/ai";
import type { CsvRow } from "../lib/csv";
import { resolveDredgingOptions, resolveShiftRules } from "./portModels";
import { notifyAiApproval } from "./schedules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DB driver boundary
type DbRow = Record<string, any>;

export const estimationBaseSchema = z.object({
  base_code: z.string().min(1).max(50),
  base_name: z.string().min(1).max(200),
  category: z.enum(["general_civil", "port", "other"]).default("general_civil"),
  fiscal_year: z.number().int().min(2000).max(2100),
  applicable_from: z.string().min(1),
  applicable_to: z.string().optional().nullable(),
  rounding_rules: z.record(z.string()).optional(),
  status: z.enum(["draft", "approved", "retired"]).optional(),
  source_type: z.enum(["mlit_electronic", "book_entry", "system_export"]).optional().nullable(),
  source_note: z.string().optional().nullable(),
});

export const treeSchema = z.object({
  base_id: z.string().min(1),
  parent_id: z.string().optional().nullable(),
  level: z.number().int().min(1).max(4).default(1),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  unit: z.string().max(30).optional().nullable(),
  standard_name: z.string().max(200).optional().nullable(),
});

const resourceSchema = z.object({
  name: z.string().min(1),
  unit: z.string().max(30),
  quantity: z.number().nonnegative(),
  unit_price: z.number().nonnegative(),
  vessel_id: z.string().optional(),
});

export const breakdownSchema = z.object({
  base_id: z.string().min(1),
  tree_id: z.string().min(1),
  condition_json: z.record(z.unknown()).default({}),
  labor: z.array(resourceSchema).default([]),
  material: z.array(resourceSchema).default([]),
  machinery: z.array(resourceSchema).default([]),
  note: z.string().optional().nullable(),
  source_type: z.string().max(30).optional().nullable(),
});

export const rateSchema = z.object({
  rate: z.number().nonnegative(),
  correction_json: z.record(z.unknown()).optional(),
  applicable_from: z.string().optional().nullable(),
  applicable_to: z.string().optional().nullable(),
});

export const quantitySchema = z.object({
  project_id: z.string().min(1),
  tree_id: z.string().min(1),
  item_name: z.string().max(200).optional().nullable(),
  standard_name: z.string().max(200).optional().nullable(),
  unit: z.string().max(30).optional().nullable(),
  quantity: z.number().nonnegative(),
  condition_json: z.record(z.unknown()).default({}),
  source_note: z.string().optional().nullable(),
});

export type QuantityRow = {
  id: string;
  project_id: string;
  tree_id: string;
  tree_code: string;
  tree_name: string;
  item_name: string | null;
  standard_name: string | null;
  unit: string | null;
  quantity: number;
  condition_json: Record<string, unknown>;
  source_note: string | null;
  created_by: string;
  updated_at: string;
};

export type BreakdownRow = {
  id: string;
  base_id: string;
  tree_id: string;
  tree_code: string;
  tree_name: string;
  condition_json: Record<string, unknown>;
  labor: ResourceItem[];
  material: ResourceItem[];
  machinery: ResourceItem[];
  note: string | null;
  source_type: string | null;
  created_by: string;
  updated_at: string;
};

export type EstimateLineRow = {
  id: string;
  tree_id: string | null;
  tree_code: string | null;
  tree_name: string | null;
  unit: string | null;
  quantity: number;
  breakdown_id: string | null;
  labor_cost: number;
  material_cost: number;
  machinery_cost: number;
  direct_cost: number;
  note: string | null;
};

export type EstimateMaterialRow = {
  id: string;
  line_id: string | null;
  resource_type: string;
  resource_name: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  source_note: string | null;
};

export type EstimateDetail = {
  id: string;
  project_id: string;
  project_name: string;
  base_id: string;
  base_code: string;
  base_name: string;
  name: string;
  status: string;
  revision: number;
  direct_cost: number;
  common_temp_cost: number;
  site_management_cost: number;
  general_management_cost: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  price_version_id: string | null;
  snapshot_sha256: string | null;
  created_by: string;
  created_at: string;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  superseded_by: string | null;
  superseded_by_actor: string | null;
  rounding_rule_json: Record<string, string>;
  warnings: string[];
  port_options: PortOptions | null;
  port_extras: ReturnType<typeof computeEstimate>["port_extras"];
  lines: EstimateLineRow[];
  materials: EstimateMaterialRow[];
};

export type EstimateListRow = {
  id: string;
  project_id: string;
  project_name: string;
  base_id: string;
  base_code: string;
  base_name: string;
  name: string;
  status: string;
  revision: number;
  direct_cost: number;
  common_temp_cost: number;
  site_management_cost: number;
  general_management_cost: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  price_version_id: string | null;
  snapshot_sha256: string | null;
  created_by: string;
  created_at: string;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  superseded_by: string | null;
  superseded_by_actor: string | null;
};

// ---- 積算基準 ----

export async function listEstimationBases(sql: Sql) {
  const bases = await sql`
    SELECT id, base_code, base_name, category, fiscal_year, applicable_from, applicable_to,
           rounding_rules, status, source_type, source_note, created_by,
           to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
           to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
    FROM estimation_bases
    ORDER BY fiscal_year DESC, base_code
  `;
  const rates = await sql`
    SELECT base_id, rate_type, rate, correction_json, applicable_from, applicable_to
    FROM overhead_rates
  `;
  return bases.map((b) => ({
    ...b,
    rounding_rules: b.rounding_rules,
    rates: rates
      .filter((r) => String(r.base_id) === String(b.id))
      .map((r) => ({ rate_type: r.rate_type, rate: Number(r.rate), correction_json: r.correction_json, applicable_from: r.applicable_from, applicable_to: r.applicable_to })),
  }));
}

export async function listApplicableBases(sql: Sql, date: string) {
  const rows = await sql`
    SELECT id, base_code, base_name, category, fiscal_year, applicable_from, applicable_to, status
    FROM estimation_bases
    WHERE status = 'approved'
      AND applicable_from <= ${date}::date
      AND (applicable_to IS NULL OR applicable_to >= ${date}::date)
    ORDER BY applicable_from DESC, fiscal_year DESC
  `;
  return {
    date,
    bases: rows,
    warning:
      rows.length === 0
        ? "適用可能な承認済み積算基準がありません。"
        : rows.length > 1
          ? "適用可能な積算基準が複数あります。適用範囲（applicable_to）を確認してください。"
          : null,
  };
}

export async function compareEstimationBases(sql: Sql, idA: string, idB: string) {
  const [a] = (await sql`
    SELECT id, base_code, base_name, fiscal_year, applicable_from, applicable_to
    FROM estimation_bases WHERE id = ${idA}
  `) as DbRow[];
  const [b] = (await sql`
    SELECT id, base_code, base_name, fiscal_year, applicable_from, applicable_to
    FROM estimation_bases WHERE id = ${idB}
  `) as DbRow[];
  if (!a || !b) {
    const err = new Error("積算基準が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const ratesA = await sql`SELECT rate_type, rate FROM overhead_rates WHERE base_id = ${idA}`;
  const ratesB = await sql`SELECT rate_type, rate FROM overhead_rates WHERE base_id = ${idB}`;
  const rateMapA = new Map(ratesA.map((r) => [String(r.rate_type), Number(r.rate)]));
  const rateMapB = new Map(ratesB.map((r) => [String(r.rate_type), Number(r.rate)]));
  const rateTypes = ["common_temp", "site_management", "general_management"];
  const rates = rateTypes.map((rt) => ({
    rate_type: rt,
    old: rateMapA.get(rt) ?? null,
    new: rateMapB.get(rt) ?? null,
    diff: rateMapA.has(rt) && rateMapB.has(rt) ? (rateMapB.get(rt) ?? 0) - (rateMapA.get(rt) ?? 0) : null,
  }));

  const bdA = await listBreakdowns(sql, { baseId: idA });
  const bdB = await listBreakdowns(sql, { baseId: idB });
  const keyOf = (bd: BreakdownRow) => `${bd.tree_id}|${JSON.stringify(bd.condition_json)}`;
  const mapB = new Map(bdB.map((bd) => [keyOf(bd), bd]));
  const breakdownDiffs: Array<Record<string, unknown>> = [];
  for (const bd of bdA) {
    const other = mapB.get(keyOf(bd));
    const resourceKey = (r: ResourceItem) => `${r.name}|${r.unit}`;
    const resourcesA = [...bd.labor, ...bd.material, ...bd.machinery];
    const resourcesB = other ? [...other.labor, ...other.material, ...other.machinery] : [];
    const mapBRes = new Map(resourcesB.map((r) => [resourceKey(r), r]));
    const diffs = resourcesA.map((r) => {
      const o = mapBRes.get(resourceKey(r));
      return {
        resource_name: r.name,
        unit: r.unit,
        old_quantity: r.quantity,
        new_quantity: o?.quantity ?? null,
        old_unit_price: r.unit_price,
        new_unit_price: o?.unit_price ?? null,
      };
    });
    breakdownDiffs.push({
      tree_code: bd.tree_code,
      tree_name: bd.tree_name,
      condition: bd.condition_json,
      exists_in_new: !!other,
      resources: diffs,
    });
  }
  return {
    base_a: a,
    base_b: b,
    rates,
    breakdowns: breakdownDiffs,
    changed_count:
      rates.filter((r) => r.diff !== 0).length +
      breakdownDiffs.filter((bd) => !bd.exists_in_new || (bd.resources as Array<{ old_quantity: number; new_quantity: number | null; old_unit_price: number; new_unit_price: number | null }>).some((r) => r.old_quantity !== r.new_quantity || r.old_unit_price !== r.new_unit_price)).length,
  };
}

export async function createEstimationBase(
  sql: Sql,
  input: z.infer<typeof estimationBaseSchema>,
  identity: Identity
) {
  const [row] = await sql`
    INSERT INTO estimation_bases
      (base_code, base_name, category, fiscal_year, applicable_from, applicable_to,
       rounding_rules, status, source_type, source_note, created_by)
    VALUES
      (${input.base_code}, ${input.base_name}, ${input.category}, ${input.fiscal_year},
       ${input.applicable_from}::date, ${input.applicable_to ?? null},
       ${JSON.stringify(input.rounding_rules ?? {})}, ${input.status ?? "draft"},
       ${input.source_type ?? null}, ${input.source_note ?? null}, ${identity.email})
    RETURNING id
  `;
  return row.id;
}

export async function updateEstimationBase(
  sql: Sql,
  id: string,
  input: Partial<z.infer<typeof estimationBaseSchema>>
) {
  const cur = await sql`SELECT * FROM estimation_bases WHERE id = ${id}`;
  if (cur.length === 0) return null;
  const c = cur[0];
  await sql`
    UPDATE estimation_bases SET
      base_code = ${input.base_code ?? c.base_code},
      base_name = ${input.base_name ?? c.base_name},
      category = ${input.category ?? c.category},
      fiscal_year = ${input.fiscal_year ?? c.fiscal_year},
      applicable_from = ${input.applicable_from ?? c.applicable_from},
      applicable_to = ${input.applicable_to !== undefined ? input.applicable_to : c.applicable_to},
      rounding_rules = ${JSON.stringify(input.rounding_rules ?? c.rounding_rules)},
      status = ${input.status ?? c.status},
      source_type = ${input.source_type !== undefined ? input.source_type : c.source_type},
      source_note = ${input.source_note !== undefined ? input.source_note : c.source_note},
      updated_at = now()
    WHERE id = ${id}
  `;
  return id;
}

export async function upsertOverheadRate(
  sql: Sql,
  baseId: string,
  rateType: string,
  input: z.infer<typeof rateSchema>
) {
  if (!["common_temp", "site_management", "general_management"].includes(rateType)) {
    const err = new Error("rate_type は common_temp / site_management / general_management のいずれかです。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const [row] = await sql`
    INSERT INTO overhead_rates (base_id, rate_type, rate, correction_json, applicable_from, applicable_to)
    VALUES (${baseId}, ${rateType}, ${input.rate},
            ${JSON.stringify(input.correction_json ?? {})},
            ${input.applicable_from ?? null}, ${input.applicable_to ?? null})
    ON CONFLICT (base_id, rate_type) DO UPDATE SET
      rate = EXCLUDED.rate,
      correction_json = EXCLUDED.correction_json,
      applicable_from = EXCLUDED.applicable_from,
      applicable_to = EXCLUDED.applicable_to,
      updated_at = now()
    RETURNING id
  `;
  return row.id;
}

export async function importOverheadRates(
  sql: Sql,
  input: { baseId: string; rows: CsvRow[] }
): Promise<{ imported: number; errors: Array<{ row: number; column: string; reason: string }> }> {
  const { baseId, rows } = input;
  const base = await sql`SELECT id FROM estimation_bases WHERE id = ${baseId}`;
  if (base.length === 0) {
    const err = new Error("積算基準が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const errors: Array<{ row: number; column: string; reason: string }> = [];
  let imported = 0;
  for (const [i, row] of rows.entries()) {
    const rowNo = i + 2;
    const rateType = headerValue(row, ["rate_type", "費目", "種別"]);
    const rateRaw = headerValue(row, ["rate", "率"]);
    const applicableFrom = headerValue(row, ["applicable_from", "適用開始"]);
    const applicableTo = headerValue(row, ["applicable_to", "適用終了"]);
    if (!["common_temp", "site_management", "general_management"].includes(rateType)) {
      errors.push({ row: rowNo, column: "rate_type", reason: `rate_type は common_temp / site_management / general_management（入力: ${rateType}）` });
      continue;
    }
    let rate = Number(rateRaw);
    if (!Number.isFinite(rate)) {
      errors.push({ row: rowNo, column: "rate", reason: "率が数値ではありません" });
      continue;
    }
    if (rate > 1 && rate <= 100) rate = rate / 100; // パーセント表記の救済
    await upsertOverheadRate(sql, baseId, rateType, {
      rate,
      applicable_from: applicableFrom || null,
      applicable_to: applicableTo || null,
    });
    imported++;
  }
  return { imported, errors };
}

// ---- 工種体系 ----

export async function listTrees(sql: Sql, baseId?: string) {
  const rows = (baseId
    ? await sql`
        SELECT id, base_id, parent_id, level, code, name, unit, standard_name, is_active
        FROM work_type_trees
        WHERE base_id = ${baseId} AND is_active = true
        ORDER BY level, code
      `
    : await sql`
        SELECT id, base_id, parent_id, level, code, name, unit, standard_name, is_active
        FROM work_type_trees
        WHERE is_active = true
        ORDER BY base_id, level, code
      `) as DbRow[];
  return rows.map((r) => ({
    id: r.id,
    base_id: r.base_id,
    parent_id: r.parent_id,
    level: r.level,
    code: r.code,
    name: r.name,
    unit: r.unit,
    standard_name: r.standard_name,
    is_active: r.is_active,
  }));
}

export async function createTree(sql: Sql, input: z.infer<typeof treeSchema>, _identity: Identity) {
  const [row] = await sql`
    INSERT INTO work_type_trees (base_id, parent_id, level, code, name, unit, standard_name)
    VALUES (${input.base_id}, ${input.parent_id ?? null}, ${input.level}, ${input.code},
            ${input.name}, ${input.unit ?? null}, ${input.standard_name ?? null})
    RETURNING id
  `;
  return row.id;
}

// ---- 歩掛 ----

export async function listBreakdowns(sql: Sql, filters: { baseId?: string; treeId?: string } = {}) {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.baseId) {
    params.push(filters.baseId);
    conds.push(`wb.base_id = $${params.length}`);
  }
  if (filters.treeId) {
    params.push(filters.treeId);
    conds.push(`wb.tree_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = (await sql(
    `
      SELECT wb.id, wb.base_id, wb.tree_id, t.code AS tree_code, t.name AS tree_name,
             wb.condition_json, wb.labor_json, wb.material_json, wb.machinery_json,
             wb.note, wb.source_type, wb.created_by,
             to_char(wb.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
      FROM work_breakdowns wb
      JOIN work_type_trees t ON t.id = wb.tree_id
      ${where}
      ORDER BY t.code, wb.updated_at DESC
    `,
    params
  )) as DbRow[];
  return rows.map((r) => ({
    id: r.id,
    base_id: r.base_id,
    tree_id: r.tree_id,
    tree_code: r.tree_code,
    tree_name: r.tree_name,
    condition_json: r.condition_json,
    labor: r.labor_json,
    material: r.material_json,
    machinery: r.machinery_json,
    note: r.note,
    source_type: r.source_type,
    created_by: r.created_by,
    updated_at: r.updated_at,
  })) as BreakdownRow[];
}

export async function createBreakdown(
  sql: Sql,
  input: z.infer<typeof breakdownSchema>,
  identity: Identity
) {
  const tree = await sql`SELECT id FROM work_type_trees WHERE id = ${input.tree_id} AND base_id = ${input.base_id}`;
  if (tree.length === 0) {
    const err = new Error("工種体系が基準に属していません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const [row] = await sql`
    INSERT INTO work_breakdowns
      (base_id, tree_id, condition_json, labor_json, material_json, machinery_json,
       note, source_type, created_by)
    VALUES
      (${input.base_id}, ${input.tree_id}, ${JSON.stringify(input.condition_json)},
       ${JSON.stringify(input.labor)}, ${JSON.stringify(input.material)},
       ${JSON.stringify(input.machinery)}, ${input.note ?? null},
       ${input.source_type ?? null}, ${identity.email})
    RETURNING id
  `;
  return row.id;
}

export async function updateBreakdown(
  sql: Sql,
  id: string,
  input: Partial<z.infer<typeof breakdownSchema>>
) {
  const cur = await sql`SELECT * FROM work_breakdowns WHERE id = ${id}`;
  if (cur.length === 0) return null;
  const c = cur[0];
  await sql`
    UPDATE work_breakdowns SET
      condition_json = ${JSON.stringify(input.condition_json ?? c.condition_json)},
      labor_json = ${JSON.stringify(input.labor ?? c.labor_json)},
      material_json = ${JSON.stringify(input.material ?? c.material_json)},
      machinery_json = ${JSON.stringify(input.machinery ?? c.machinery_json)},
      note = ${input.note !== undefined ? input.note : c.note},
      updated_at = now()
    WHERE id = ${id}
  `;
  return id;
}

function headerValue(row: CsvRow, keys: string[]): string {
  for (const k of keys) {
    const found = Object.entries(row).find(
      ([key]) => key.trim().toLowerCase() === k.toLowerCase()
    );
    if (found && found[1] !== undefined && String(found[1]).trim() !== "") return String(found[1]).trim();
  }
  return "";
}

export async function importBreakdowns(
  sql: Sql,
  input: {
    baseId: string;
    rows: CsvRow[];
    identity: Identity;
  }
) {
  const { baseId, rows, identity } = input;
  const base = await sql`SELECT id FROM estimation_bases WHERE id = ${baseId}`;
  if (base.length === 0) {
    const err = new Error("積算基準が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const trees = await sql`
    SELECT id, code, name FROM work_type_trees WHERE base_id = ${baseId}
  `;
  const treeByCode = new Map(trees.map((t) => [String(t.code), t]));
  const groups = new Map<string, { tree_id: string; condition: Record<string, unknown>; labor: ResourceItem[]; material: ResourceItem[]; machinery: ResourceItem[] }>();
  const errors: Array<{ row: number; column: string; reason: string }> = [];

  rows.forEach((row, i) => {
    const rowNo = i + 2;
    const treeCode = headerValue(row, ["tree_code", "工種コード", "細別コード"]);
    const conditionRaw = headerValue(row, ["condition_json", "条件", "施工条件"]);
    const resourceType = headerValue(row, ["resource_type", "区分", "種別"]).toLowerCase();
    const name = headerValue(row, ["resource_name", "名称", "資源名"]);
    const unit = headerValue(row, ["resource_unit", "単位"]);
    const qty = Number(headerValue(row, ["quantity_per_unit", "数量", "数量/単位"]));
    const price = Number(headerValue(row, ["unit_price", "単価"]));
    if (!treeCode || !treeByCode.has(treeCode)) {
      errors.push({ row: rowNo, column: "工種コード", reason: `工種コード ${treeCode || "(空)"} が基準にありません` });
      return;
    }
    if (!["labor", "material", "machinery"].includes(resourceType)) {
      errors.push({ row: rowNo, column: "区分", reason: `区分は labor/material/machinery のいずれか（入力: ${resourceType}）` });
      return;
    }
    if (!name || !Number.isFinite(qty) || !Number.isFinite(price)) {
      errors.push({ row: rowNo, column: "資源", reason: "名称・数量・単価が不正です" });
      return;
    }
    let condition: Record<string, unknown> = {};
    if (conditionRaw) {
      try {
        condition = JSON.parse(conditionRaw);
      } catch {
        errors.push({ row: rowNo, column: "条件", reason: "condition_json がJSON形式ではありません" });
        return;
      }
    }
    const key = `${treeCode}|${JSON.stringify(condition)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        tree_id: String(treeByCode.get(treeCode)!.id),
        condition,
        labor: [],
        material: [],
        machinery: [],
      });
    }
    const g = groups.get(key)!;
    const item: ResourceItem = { name, unit, quantity: qty, unit_price: price };
    if (resourceType === "labor") g.labor.push(item);
    else if (resourceType === "material") g.material.push(item);
    else g.machinery.push(item);
  });

  let imported = 0;
  for (const g of groups.values()) {
    await sql`
      INSERT INTO work_breakdowns
        (base_id, tree_id, condition_json, labor_json, material_json, machinery_json,
         source_type, created_by)
      VALUES
        (${baseId}, ${g.tree_id}, ${JSON.stringify(g.condition)},
         ${JSON.stringify(g.labor)}, ${JSON.stringify(g.material)}, ${JSON.stringify(g.machinery)},
         'system_export', ${identity.email})
    `;
    imported++;
  }
  return { imported, errors };
}

// ---- 数量 ----

export async function listQuantities(sql: Sql, projectId: string): Promise<QuantityRow[]> {
  const rows = (await sql`
    SELECT q.id, q.project_id, q.tree_id, t.code AS tree_code, t.name AS tree_name,
           q.item_name, q.standard_name, q.unit, q.quantity, q.condition_json,
           q.source_note, q.created_by,
           to_char(q.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
    FROM quantities q
    JOIN work_type_trees t ON t.id = q.tree_id
    WHERE q.project_id = ${projectId}
    ORDER BY t.code
  `) as DbRow[];
  return rows.map((r) => ({
    ...r,
    quantity: Number(r.quantity),
  })) as QuantityRow[];
}

export async function addQuantity(
  sql: Sql,
  input: z.infer<typeof quantitySchema>,
  identity: Identity
) {
  const project = await sql`SELECT id FROM projects WHERE id = ${input.project_id}`;
  if (project.length === 0) {
    const err = new Error("案件が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const [row] = await sql`
    INSERT INTO quantities
      (project_id, tree_id, item_name, standard_name, unit, quantity, condition_json, source_note, created_by)
    VALUES
      (${input.project_id}, ${input.tree_id}, ${input.item_name ?? null},
       ${input.standard_name ?? null}, ${input.unit ?? null}, ${input.quantity},
       ${JSON.stringify(input.condition_json)}, ${input.source_note ?? null}, ${identity.email})
    RETURNING id
  `;
  return row.id;
}

export async function updateQuantity(
  sql: Sql,
  id: string,
  input: Partial<z.infer<typeof quantitySchema>>
) {
  const cur = await sql`SELECT * FROM quantities WHERE id = ${id}`;
  if (cur.length === 0) return null;
  const c = cur[0];
  await sql`
    UPDATE quantities SET
      tree_id = ${input.tree_id ?? c.tree_id},
      item_name = ${input.item_name !== undefined ? input.item_name : c.item_name},
      standard_name = ${input.standard_name !== undefined ? input.standard_name : c.standard_name},
      unit = ${input.unit !== undefined ? input.unit : c.unit},
      quantity = ${input.quantity ?? c.quantity},
      condition_json = ${JSON.stringify(input.condition_json ?? c.condition_json)},
      source_note = ${input.source_note !== undefined ? input.source_note : c.source_note},
      updated_at = now()
    WHERE id = ${id}
  `;
  return id;
}

export async function deleteQuantity(sql: Sql, id: string) {
  const [row] = await sql`DELETE FROM quantities WHERE id = ${id} RETURNING id`;
  return row ?? null;
}

// ---- 積算計算 ----

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function calculateEstimate(
  sql: Sql,
  input: {
    projectId: string;
    baseId: string;
    name: string;
    identity: Identity;
    portOptions?: Partial<PortOptions>;
    /** 任意: 積算時に採用した単価版（採用単価フロー導入後の再現用） */
    priceVersionId?: string | null;
  }
) {
  const { projectId, baseId, name, identity, portOptions, priceVersionId } = input;
  const [project] = await sql`SELECT id, name FROM projects WHERE id = ${projectId}`;
  if (!project) {
    const err = new Error("案件が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const [base] = (await sql`
    SELECT id, base_code, base_name, category, fiscal_year, applicable_from, applicable_to,
           rounding_rules, status, source_type, source_note
    FROM estimation_bases WHERE id = ${baseId}
  `) as DbRow[];
  if (!base) {
    const err = new Error("積算基準が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (String(base.status) !== "approved") {
    const err = new Error("この積算基準は承認されていないため計算できません。承認済みの積算基準を選択してください。");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  const now = new Date();
  if (base.applicable_from && new Date(String(base.applicable_from)) > now) {
    const err = new Error(`この積算基準は ${String(base.applicable_from).slice(0, 10)} から適用のため、現時点では計算できません。`);
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  if (base.applicable_to && new Date(String(base.applicable_to)) < now) {
    const err = new Error(`この積算基準は ${String(base.applicable_to).slice(0, 10)} で適用期間が終了しています。`);
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  const quantities = await listQuantities(sql, projectId);
  const ratesRows = await sql`
    SELECT rate_type, rate FROM overhead_rates WHERE base_id = ${baseId}
  `;
  const rateMap = new Map(ratesRows.map((r) => [String(r.rate_type), Number(r.rate)]));
  const rates = {
    common_temp: rateMap.get("common_temp") ?? 0,
    site_management: rateMap.get("site_management") ?? 0,
    general_management: rateMap.get("general_management") ?? 0,
  };
  const breakdownRows = await listBreakdowns(sql, { baseId });
  const breakdownsByTree = new Map<string, BreakdownInput[]>();
  for (const b of breakdownRows) {
    const list = breakdownsByTree.get(String(b.tree_id)) ?? [];
    list.push({
      id: b.id,
      condition_json: b.condition_json,
      labor: b.labor,
      material: b.material,
      machinery: b.machinery,
    });
    breakdownsByTree.set(String(b.tree_id), list);
  }
  let port: PortOptions | null = null;
  if (base.category === "port") {
    const dredge = await resolveDredgingOptions(sql, {
      soil_type_code: portOptions?.soil_type_code ?? null,
      spoil_ground_code: portOptions?.spoil_ground_code ?? null,
      transport_distance_km: portOptions?.transport_distance_km ?? null,
    });
    const shift = await resolveShiftRules(sql, portOptions?.shift_rules ?? []);
    port = {
      operation_rate: portOptions?.operation_rate ?? 0.7,
      mobilization_days: portOptions?.mobilization_days ?? null,
      soil_correction: portOptions?.soil_correction ?? 0,
      night_surcharge: portOptions?.night_surcharge ?? 0,
      soil_factor: dredge.soil_factor,
      soil_type_code: dredge.soil_type_code,
      spoil_unit_price: dredge.spoil_unit_price,
      spoil_ground_code: dredge.spoil_ground_code,
      transport_coefficient: dredge.transport_coefficient,
      transport_distance_km: dredge.transport_distance_km,
      shift_rules: shift.shift_rules.map((r) => r.code),
      shift_labor_surcharge: shift.shift_labor_surcharge,
      shift_machinery_surcharge: shift.shift_machinery_surcharge,
    };
  }
  const vessels = base.category === "port" ? await loadVesselsMap(sql) : undefined;
  const result = computeEstimate({
    quantities: quantities.map((q) => ({
      tree_id: String(q.tree_id),
      tree_code: q.tree_code,
      tree_name: q.tree_name,
      unit: q.unit ?? "",
      quantity: q.quantity,
      condition_json: q.condition_json,
    })),
    breakdownsByTree,
    rates,
    rounding: base.rounding_rules,
    taxRate: 0.1,
    vessels,
    port: port ?? undefined,
  });

  // 計算再現用スナップショット: 数量・歩掛・率・基準・港湾条件の一式を固定し、SHA-256でハッシュ化
  const snapshot = {
    schema: 1,
    base: {
      id: base.id,
      base_code: base.base_code,
      base_name: base.base_name,
      category: base.category,
      fiscal_year: base.fiscal_year,
      applicable_from: base.applicable_from ?? null,
      applicable_to: base.applicable_to ?? null,
      rounding_rules: base.rounding_rules,
      status: base.status,
      source_type: base.source_type,
    },
    rates,
    tax_rate: 0.1,
    quantities: quantities.map((q) => ({
      id: q.id,
      tree_id: q.tree_id,
      tree_code: q.tree_code,
      tree_name: q.tree_name,
      unit: q.unit ?? "",
      quantity: q.quantity,
      condition_json: q.condition_json,
    })),
    breakdowns: breakdownRows.map((b) => ({
      id: b.id,
      tree_id: b.tree_id,
      labor: b.labor,
      material: b.material,
      machinery: b.machinery,
      condition_json: b.condition_json,
    })),
    price_version_id: priceVersionId ?? null,
    vessels: vessels
      ? [...vessels.entries()].map(([code, v]) => ({
          code,
          capacity: v.capacity,
          availability_factor: v.availability_factor,
          mobilization_days: v.mobilization_days,
          standby_rate: v.standby_rate,
          hire_rate_per_day: v.hire_rate_per_day,
        }))
      : null,
    port: port
      ? {
          operation_rate: port.operation_rate,
          mobilization_days: port.mobilization_days,
          soil_correction: port.soil_correction,
          night_surcharge: port.night_surcharge,
          soil_factor: port.soil_factor,
          soil_type_code: port.soil_type_code,
          spoil_unit_price: port.spoil_unit_price,
          spoil_ground_code: port.spoil_ground_code,
          transport_coefficient: port.transport_coefficient,
          transport_distance_km: port.transport_distance_km,
          shift_rules: port.shift_rules,
          shift_labor_surcharge: port.shift_labor_surcharge,
          shift_machinery_surcharge: port.shift_machinery_surcharge,
        }
      : null,
  };
  const snapshotSha256 = await sha256Hex(JSON.stringify(snapshot));

  const [header] = await sql`
    INSERT INTO estimate_headers
      (project_id, base_id, name, status, direct_cost, common_temp_cost,
       site_management_cost, general_management_cost, subtotal, tax_amount, total,
       rounding_rule_json, warnings, port_options, port_extras,
       price_version_id, input_snapshot, snapshot_sha256, created_by)
    VALUES
      (${projectId}, ${baseId}, ${name}, 'draft', ${result.direct_cost},
       ${result.common_temp_cost}, ${result.site_management_cost},
       ${result.general_management_cost}, ${result.subtotal}, ${result.tax_amount},
       ${result.total}, ${JSON.stringify(base.rounding_rules)},
       ${JSON.stringify(result.warnings)}, ${port ? JSON.stringify(port) : null},
       ${result.port_extras ? JSON.stringify(result.port_extras) : null},
       ${priceVersionId ?? null}, ${JSON.stringify(snapshot)}, ${snapshotSha256}, ${identity.email})
    RETURNING id
  `;

  for (let i = 0; i < result.lines.length; i++) {
    const line = result.lines[i];
    const [lineRow] = await sql`
      INSERT INTO estimate_lines
        (estimate_id, tree_id, tree_code, tree_name, unit, quantity, breakdown_id,
         labor_cost, material_cost, machinery_cost, direct_cost, note)
      VALUES
        (${header.id}, ${line.tree_id}, ${line.tree_code}, ${line.tree_name},
         ${line.unit}, ${line.quantity}, ${line.breakdown_id},
         ${line.labor_cost}, ${line.material_cost}, ${line.machinery_cost},
         ${line.direct_cost}, ${line.note})
      RETURNING id
    `;
    for (const m of result.materials.filter((x) => x.line_index === i)) {
      await sql`
        INSERT INTO estimate_materials
          (estimate_id, line_id, resource_type, resource_name, unit, quantity,
           unit_price, amount, source_note)
        VALUES
          (${header.id}, ${lineRow.id}, ${m.resource_type}, ${m.resource_name},
           ${m.unit}, ${m.quantity}, ${m.unit_price}, ${m.amount},
           ${`数量 ${line.quantity} × 歩掛 ${m.quantity / Math.max(line.quantity, 1)} × 単価 ${m.unit_price}`})
      `;
    }
  }
  const estimate = await getEstimate(sql, header.id);
  if (!estimate) {
    const err = new Error("積算結果の保存に失敗しました。");
    (err as Error & { status?: number }).status = 500;
    throw err;
  }
  return estimate;
}

export async function listEstimates(sql: Sql, projectId?: string): Promise<EstimateListRow[]> {
  const rows = (projectId
    ? await sql`
        SELECT e.id, e.project_id, p.name AS project_name, e.base_id, b.base_code, b.base_name,
               e.name, e.status, e.revision, e.direct_cost, e.common_temp_cost, e.site_management_cost,
               e.general_management_cost, e.subtotal, e.tax_amount, e.total,
               e.price_version_id, e.snapshot_sha256, e.created_by,
               e.submitted_by, e.submitted_at, e.approved_by, e.approved_at,
               e.confirmed_by, e.confirmed_at, e.superseded_by, e.superseded_by_actor,
               to_char(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
        FROM estimate_headers e
        JOIN projects p ON p.id = e.project_id
        JOIN estimation_bases b ON b.id = e.base_id
        WHERE e.project_id = ${projectId}
        ORDER BY e.created_at DESC
      `
    : await sql`
        SELECT e.id, e.project_id, p.name AS project_name, e.base_id, b.base_code, b.base_name,
               e.name, e.status, e.revision, e.direct_cost, e.common_temp_cost, e.site_management_cost,
               e.general_management_cost, e.subtotal, e.tax_amount, e.total,
               e.price_version_id, e.snapshot_sha256, e.created_by,
               e.submitted_by, e.submitted_at, e.approved_by, e.approved_at,
               e.confirmed_by, e.confirmed_at, e.superseded_by, e.superseded_by_actor,
               to_char(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
        FROM estimate_headers e
        JOIN projects p ON p.id = e.project_id
        JOIN estimation_bases b ON b.id = e.base_id
        ORDER BY e.created_at DESC
      `) as DbRow[];
  return rows.map((r) => ({
    ...r,
    direct_cost: Number(r.direct_cost),
    common_temp_cost: Number(r.common_temp_cost),
    site_management_cost: Number(r.site_management_cost),
    general_management_cost: Number(r.general_management_cost),
    subtotal: Number(r.subtotal),
    tax_amount: Number(r.tax_amount),
    total: Number(r.total),
  })) as EstimateListRow[];
}

export async function getEstimate(sql: Sql, id: string): Promise<EstimateDetail | null> {
  const [header] = (await sql`
    SELECT e.id, e.project_id, p.name AS project_name, e.base_id, b.base_code, b.base_name,
           e.name, e.status, e.revision, e.direct_cost, e.common_temp_cost, e.site_management_cost,
           e.general_management_cost, e.subtotal, e.tax_amount, e.total,
           e.price_version_id, e.snapshot_sha256, e.created_by,
           e.submitted_by, e.submitted_at, e.approved_by, e.approved_at,
           e.confirmed_by, e.confirmed_at, e.superseded_by, e.superseded_by_actor,
           e.rounding_rule_json, e.warnings, e.port_options, e.port_extras,
           to_char(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
    FROM estimate_headers e
    JOIN projects p ON p.id = e.project_id
    JOIN estimation_bases b ON b.id = e.base_id
    WHERE e.id = ${id}
  `) as DbRow[];
  if (!header) return null;
  const lines = (await sql`
    SELECT id, tree_id, tree_code, tree_name, unit, quantity, breakdown_id,
           labor_cost, material_cost, machinery_cost, direct_cost, note
    FROM estimate_lines WHERE estimate_id = ${id}
    ORDER BY tree_code
  `) as DbRow[];
  const materials = (await sql`
    SELECT id, line_id, resource_type, resource_name, unit, quantity, unit_price, amount, source_note
    FROM estimate_materials WHERE estimate_id = ${id}
    ORDER BY line_id, resource_type
  `) as DbRow[];
  const num = (v: unknown) => Number(v);
  return {
    ...header,
    port_options: header.port_options ?? null,
    port_extras: header.port_extras ?? null,
    direct_cost: num(header.direct_cost),
    common_temp_cost: num(header.common_temp_cost),
    site_management_cost: num(header.site_management_cost),
    general_management_cost: num(header.general_management_cost),
    subtotal: num(header.subtotal),
    tax_amount: num(header.tax_amount),
    total: num(header.total),
    lines: lines.map((l) => ({
      ...l,
      quantity: num(l.quantity),
      labor_cost: num(l.labor_cost),
      material_cost: num(l.material_cost),
      machinery_cost: num(l.machinery_cost),
      direct_cost: num(l.direct_cost),
    })) as EstimateLineRow[],
    materials: materials.map((m) => ({
      ...m,
      quantity: num(m.quantity),
      unit_price: num(m.unit_price),
      amount: num(m.amount),
    })) as EstimateMaterialRow[],
  } as EstimateDetail;
}

async function loadVesselsMap(sql: Sql): Promise<Map<string, VesselInfo>> {
  const rows = (await sql`
    SELECT vessel_code, capacity, availability_factor, mobilization_days,
           standby_rate, hire_rate_per_day
    FROM vessels WHERE is_active = true
  `) as DbRow[];
  return new Map(
    rows.map((r) => [
      String(r.vessel_code),
      {
        capacity: Number(r.capacity ?? 1),
        availability_factor: Number(r.availability_factor),
        mobilization_days: Number(r.mobilization_days ?? 0),
        standby_rate: Number(r.standby_rate),
        hire_rate_per_day: Number(r.hire_rate_per_day),
      },
    ])
  );
}

async function requireEstimateStatus(sql: Sql, id: string, allowed: string[]): Promise<{ id: string; status: string }> {
  const [row] = await sql`
    SELECT status FROM estimate_headers WHERE id = ${id}
  `;
  if (!row) {
    const err = new Error("積算結果が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const status = String(row.status);
  if (!allowed.includes(status)) {
    const err = new Error(`この積算は現在「${status}」のため操作できません。`);
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  return { id, status };
}

/** 積算担当者が確認依頼へ提出（draft → review） */
export async function submitEstimate(sql: Sql, id: string, identity: Identity) {
  await requireEstimateStatus(sql, id, ["draft"]);
  const [updated] = await sql`
    UPDATE estimate_headers
    SET status = 'review', submitted_by = ${identity.email}, submitted_at = now(), updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return updated ?? null;
}

/** 積算責任者・管理者が承認（draft / review / confirmed → approved） */
export async function approveEstimate(sql: Sql, id: string, identity: Identity) {
  await requireEstimateStatus(sql, id, ["draft", "review", "confirmed"]);
  const [updated] = await sql`
    UPDATE estimate_headers
    SET status = 'approved',
        confirmed_by = ${identity.email}, confirmed_at = now(),
        approved_by = ${identity.email}, approved_at = now(),
        updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return updated ?? null;
}

/** 確認依頼を差し戻し（review → draft） */
export async function rejectEstimate(sql: Sql, id: string, identity: Identity) {
  await requireEstimateStatus(sql, id, ["review"]);
  const [updated] = await sql`
    UPDATE estimate_headers
    SET status = 'draft', submitted_by = NULL, submitted_at = NULL,
        rejected_by = ${identity.email}, rejected_at = now(), updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return updated ?? null;
}

/** 承認済み積算を変更積算（新規draft）で置き換え（approved → superseded） */
export async function supersedeEstimate(sql: Sql, id: string, supersedingId: string, identity: Identity) {
  await requireEstimateStatus(sql, id, ["approved", "confirmed"]);
  const [target] = await sql`
    SELECT id FROM estimate_headers WHERE id = ${supersedingId}
  `;
  if (!target) {
    const err = new Error("後継の変更積算が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (supersedingId === id) {
    const err = new Error("後継積算は自分自身にできません。");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  const [updated] = await sql`
    UPDATE estimate_headers
    SET status = 'superseded', superseded_by = ${supersedingId},
        superseded_by_actor = ${identity.email}, superseded_at = now(), updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return updated ?? null;
}

/** 後方互換: 旧confirmは approve と同じ確定処理を行う */
export async function confirmEstimate(sql: Sql, id: string, identity: Identity) {
  return approveEstimate(sql, id, identity);
}

export async function deleteEstimate(sql: Sql, id: string) {
  await requireEstimateStatus(sql, id, ["draft"]);
  const [deleted] = await sql`
    DELETE FROM estimate_headers WHERE id = ${id} RETURNING id
  `;
  return deleted ?? null;
}

// ---- AI歩掛選定候補 ----

export async function aiSuggestBreakdowns(
  sql: Sql,
  env: Env,
  input: { projectId: string; baseId: string; identity: Identity }
) {
  const { projectId, baseId, identity } = input;
  const quantities = await listQuantities(sql, projectId);
  if (quantities.length === 0) {
    const err = new Error("数量が登録されていません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const breakdowns = await listBreakdowns(sql, { baseId });
  const breakdownById = new Map(breakdowns.map((b) => [String(b.id), b]));
  const rules: Array<{
    quantity_id: string;
    tree_code: string;
    tree_name: string;
    breakdown_id: string;
    score: number;
    reason: string;
  }> = [];

  for (const q of quantities) {
    const candidates = breakdowns.filter((b) => String(b.tree_id) === String(q.tree_id));
    if (candidates.length === 0) {
      rules.push({
        quantity_id: String(q.id),
        tree_code: q.tree_code,
        tree_name: q.tree_name,
        breakdown_id: "",
        score: 0,
        reason: "歩掛なし",
      });
      continue;
    }
    const exact = candidates.find((b) => JSON.stringify(b.condition_json) === JSON.stringify(q.condition_json));
    const subset = exact ?? candidates.find((b) =>
      Object.entries(b.condition_json).every(([k, v]) => q.condition_json[k] === v)
    );
    const pick = subset ?? candidates[0];
    rules.push({
      quantity_id: String(q.id),
      tree_code: q.tree_code,
      tree_name: q.tree_name,
      breakdown_id: String(pick.id),
      score: subset ? 0.95 : 0.6,
      reason: subset ? "施工条件が一致" : "条件一致なし（既定歩掛）",
    });
  }

  let provider = "rule";
  let model: string | null = null;
  let aiRows: typeof rules = [];
  try {
    const prompt = JSON.stringify({
      task: "以下の数量に対する歩掛候補を選定し、JSON配列で返してください。",
      quantities: quantities.map((q) => ({
        id: q.id,
        tree_code: q.tree_code,
        tree_name: q.tree_name,
        condition: q.condition_json,
        candidates: breakdowns
          .filter((b) => String(b.tree_id) === String(q.tree_id))
          .map((b) => ({
            id: b.id,
            condition: b.condition_json,
            labor: b.labor,
            material: b.material,
            machinery: b.machinery,
          })),
      })),
      output_format: '[{"quantity_id":"...","breakdown_id":"...","score":0.0,"reason":"..."}]',
    });
    const res = await generateAiText(env, {
      system:
        "あなたは公共土木積算の歩掛選定支援AIです。計算は行わず、候補選定の理由を提示してください。JSON配列のみ返してください。",
      prompt,
    }, "breakdown");
    if (res) {
      provider = res.provider;
      model = res.model;
      const parsed = JSON.parse(res.text) as Array<{
        quantity_id?: string;
        breakdown_id?: string;
        score?: number;
        reason?: string;
      }>;
      aiRows = parsed
        .filter((r) => r.quantity_id && r.breakdown_id && breakdownById.has(String(r.breakdown_id)))
        .map((r) => {
          const q = quantities.find((x) => String(x.id) === String(r.quantity_id));
          return {
            quantity_id: String(r.quantity_id),
            tree_code: q?.tree_code ?? "",
            tree_name: q?.tree_name ?? "",
            breakdown_id: String(r.breakdown_id),
            score: Math.max(0, Math.min(1, r.score ?? 0)),
            reason: r.reason ?? "AI選定",
          };
        });
    }
  } catch (e) {
    console.warn("ai_breakdown_suggest_fallback", e);
  }
  const rows = aiRows.length > 0 ? aiRows : rules;
  for (const r of rows) {
    await sql`
      INSERT INTO ai_suggestions
        (suggestion_type, target_type, target_id, content, rationale, provider, model, created_by)
      VALUES
        ('breakdown_selection', 'quantity', ${r.quantity_id},
         ${JSON.stringify({ tree_code: r.tree_code, tree_name: r.tree_name, breakdown_id: r.breakdown_id, score: r.score })},
         ${r.reason}, ${provider}, ${model}, ${identity.email})
    `;
  }
  try {
    await notifyAiApproval(
      sql,
      env,
      `[CCI] AI歩掛候補 承認依頼（${rows.length}件）`,
      `案件 ${projectId} にAI歩掛候補${rows.length}件が生成されました。承認待ちです。`
    );
  } catch (e) {
    console.warn("breakdown_suggest_notify_failed", e);
  }
  return { provider, model, suggestions: rows };
}
