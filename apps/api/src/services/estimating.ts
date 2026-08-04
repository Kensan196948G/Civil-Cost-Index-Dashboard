import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Env } from "../types";
import type { Identity } from "../lib/auth";
import { computeEstimate, type BreakdownInput, type ResourceItem } from "../lib/estimating";
import { generateAiText } from "../lib/ai";
import type { CsvRow } from "../lib/csv";

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
  direct_cost: number;
  common_temp_cost: number;
  site_management_cost: number;
  general_management_cost: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  rounding_rule_json: Record<string, string>;
  warnings: string[];
  created_by: string;
  created_at: string;
  lines: EstimateLineRow[];
  materials: EstimateMaterialRow[];
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

export async function calculateEstimate(
  sql: Sql,
  input: { projectId: string; baseId: string; name: string; identity: Identity }
) {
  const { projectId, baseId, name, identity } = input;
  const [project] = await sql`SELECT id, name FROM projects WHERE id = ${projectId}`;
  if (!project) {
    const err = new Error("案件が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const [base] = await sql`
    SELECT id, base_code, base_name, rounding_rules FROM estimation_bases WHERE id = ${baseId}
  `;
  if (!base) {
    const err = new Error("積算基準が見つかりません。");
    (err as Error & { status?: number }).status = 404;
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
  });

  const [header] = await sql`
    INSERT INTO estimate_headers
      (project_id, base_id, name, status, direct_cost, common_temp_cost,
       site_management_cost, general_management_cost, subtotal, tax_amount, total,
       rounding_rule_json, warnings, created_by)
    VALUES
      (${projectId}, ${baseId}, ${name}, 'draft', ${result.direct_cost},
       ${result.common_temp_cost}, ${result.site_management_cost},
       ${result.general_management_cost}, ${result.subtotal}, ${result.tax_amount},
       ${result.total}, ${JSON.stringify(base.rounding_rules)},
       ${JSON.stringify(result.warnings)}, ${identity.email})
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

export async function listEstimates(sql: Sql, projectId?: string) {
  const rows = projectId
    ? await sql`
        SELECT e.id, e.project_id, p.name AS project_name, e.base_id, b.base_code, b.base_name,
               e.name, e.status, e.direct_cost, e.common_temp_cost, e.site_management_cost,
               e.general_management_cost, e.subtotal, e.tax_amount, e.total, e.created_by,
               to_char(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
        FROM estimate_headers e
        JOIN projects p ON p.id = e.project_id
        JOIN estimation_bases b ON b.id = e.base_id
        WHERE e.project_id = ${projectId}
        ORDER BY e.created_at DESC
      `
    : await sql`
        SELECT e.id, e.project_id, p.name AS project_name, e.base_id, b.base_code, b.base_name,
               e.name, e.status, e.direct_cost, e.common_temp_cost, e.site_management_cost,
               e.general_management_cost, e.subtotal, e.tax_amount, e.total, e.created_by,
               to_char(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
        FROM estimate_headers e
        JOIN projects p ON p.id = e.project_id
        JOIN estimation_bases b ON b.id = e.base_id
        ORDER BY e.created_at DESC
      `;
  return rows.map((r) => ({
    ...r,
    direct_cost: Number(r.direct_cost),
    common_temp_cost: Number(r.common_temp_cost),
    site_management_cost: Number(r.site_management_cost),
    general_management_cost: Number(r.general_management_cost),
    subtotal: Number(r.subtotal),
    tax_amount: Number(r.tax_amount),
    total: Number(r.total),
  }));
}

export async function getEstimate(sql: Sql, id: string): Promise<EstimateDetail | null> {
  const [header] = (await sql`
    SELECT e.id, e.project_id, p.name AS project_name, e.base_id, b.base_code, b.base_name,
           e.name, e.status, e.direct_cost, e.common_temp_cost, e.site_management_cost,
           e.general_management_cost, e.subtotal, e.tax_amount, e.total,
           e.rounding_rule_json, e.warnings, e.created_by,
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

export async function deleteEstimate(sql: Sql, id: string) {
  const [row] = await sql`
    DELETE FROM estimate_headers WHERE id = ${id} RETURNING id
  `;
  return row ?? null;
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
    });
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
  return { provider, model, suggestions: rows };
}
