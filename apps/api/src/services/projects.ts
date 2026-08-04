import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Identity } from "../lib/auth";

export const projectSchema = z.object({
  name: z.string().min(1).max(200),
  client_name: z.string().max(200).optional().nullable(),
  work_type: z.string().max(100).optional().nullable(),
  region_id: z.string().optional().nullable(),
  bid_date: z.string().optional().nullable(),
  contract_date: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  status: z.enum(["planning", "bidding", "contracted", "executing", "completed"]).optional(),
});

export const projectPatchSchema = projectSchema.partial();

export const projectItemSchema = z.object({
  item_id: z.string().min(1),
  region_id: z.string().optional().nullable(),
  quantity: z.number().positive(),
  base_unit_price: z.number().positive(),
  procurement_month: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const projectItemPatchSchema = projectItemSchema.partial();

export const simulationSchema = z.object({
  scenarios: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        delta: z.number().finite(),
      })
    )
    .min(1)
    .max(5)
    .optional(),
  index_item_id: z.string().optional().nullable(),
  base_period: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
});

export type ProjectItem = {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  data_kind: string;
  estimate_usable: boolean;
  region_id: string | null;
  region_name: string | null;
  region_code: string | null;
  quantity: number;
  base_unit_price: number;
  procurement_month: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  name: string;
  client_name: string | null;
  work_type: string | null;
  region_id: string | null;
  region_name: string | null;
  bid_date: string | null;
  contract_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  items: ProjectItem[];
};

export type ProjectSummary = Omit<Project, "items"> & {
  item_count: number;
  base_total: number;
};

export async function listProjects(sql: Sql): Promise<ProjectSummary[]> {
  const rows = await sql`
    SELECT p.id, p.name, p.client_name, p.work_type, p.region_id, r.region_name,
           p.bid_date, p.contract_date, p.start_date, p.end_date, p.status,
           p.created_by,
           to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
           to_char(p.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at,
           (SELECT count(*)::int FROM project_items pi WHERE pi.project_id = p.id) AS item_count,
           (SELECT coalesce(sum(pi.quantity * pi.base_unit_price), 0) FROM project_items pi WHERE pi.project_id = p.id) AS base_total
    FROM projects p
    LEFT JOIN regions r ON r.id = p.region_id
    ORDER BY p.created_at DESC
  `;
  return rows.map((r) => ({
    ...r,
    base_total: Number(r.base_total),
  })) as ProjectSummary[];
}

export async function getProject(sql: Sql, id: string): Promise<Project | null> {
  const [project] = await sql`
    SELECT p.id, p.name, p.client_name, p.work_type, p.region_id, r.region_name,
           p.bid_date, p.contract_date, p.start_date, p.end_date, p.status,
           p.created_by,
           to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
           to_char(p.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
    FROM projects p
    LEFT JOIN regions r ON r.id = p.region_id
    WHERE p.id = ${id}
  `;
  if (!project) return null;
  const items = await sql`
    SELECT pi.id, pi.item_id, i.item_code, i.item_name, i.data_kind, i.estimate_usable,
           pi.region_id, r.region_name, r.region_code,
           pi.quantity, pi.base_unit_price, pi.procurement_month, pi.note,
           to_char(pi.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
           to_char(pi.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
    FROM project_items pi
    JOIN items i ON i.id = pi.item_id
    LEFT JOIN regions r ON r.id = pi.region_id
    WHERE pi.project_id = ${id}
    ORDER BY pi.created_at
  `;
  return {
    ...project,
    items: items.map((it) => ({
      ...it,
      quantity: Number(it.quantity),
      base_unit_price: Number(it.base_unit_price),
    })) as ProjectItem[],
  } as Project;
}

export async function createProject(
  sql: Sql,
  input: z.infer<typeof projectSchema>,
  identity: Identity
): Promise<Project> {
  const [row] = await sql`
    INSERT INTO projects
      (name, client_name, work_type, region_id, bid_date, contract_date,
       start_date, end_date, status, created_by)
    VALUES
      (${input.name}, ${input.client_name ?? null}, ${input.work_type ?? null},
       ${input.region_id ?? null}, ${input.bid_date ?? null}, ${input.contract_date ?? null},
       ${input.start_date ?? null}, ${input.end_date ?? null},
       ${input.status ?? "planning"}, ${identity.email})
    RETURNING id
  `;
  const project = await getProject(sql, row.id);
  if (!project) {
    const err = new Error("案件の作成に失敗しました。");
    (err as Error & { status?: number }).status = 500;
    throw err;
  }
  return project;
}

export async function updateProject(
  sql: Sql,
  id: string,
  input: z.infer<typeof projectPatchSchema>
): Promise<Project | null> {
  const cur = await sql`SELECT * FROM projects WHERE id = ${id}`;
  if (cur.length === 0) return null;
  const c = cur[0];
  await sql`
    UPDATE projects SET
      name = ${input.name ?? c.name},
      client_name = ${input.client_name !== undefined ? input.client_name : c.client_name},
      work_type = ${input.work_type !== undefined ? input.work_type : c.work_type},
      region_id = ${input.region_id !== undefined ? input.region_id : c.region_id},
      bid_date = ${input.bid_date !== undefined ? input.bid_date : c.bid_date},
      contract_date = ${input.contract_date !== undefined ? input.contract_date : c.contract_date},
      start_date = ${input.start_date !== undefined ? input.start_date : c.start_date},
      end_date = ${input.end_date !== undefined ? input.end_date : c.end_date},
      status = ${input.status ?? c.status},
      updated_at = now()
    WHERE id = ${id}
  `;
  return getProject(sql, id);
}

export async function deleteProject(sql: Sql, id: string) {
  const [row] = await sql`
    DELETE FROM projects WHERE id = ${id} RETURNING id
  `;
  return row ?? null;
}

export async function addProjectItem(
  sql: Sql,
  projectId: string,
  input: z.infer<typeof projectItemSchema>
) {
  const [row] = await sql`
    INSERT INTO project_items
      (project_id, item_id, region_id, quantity, base_unit_price, procurement_month, note)
    VALUES
      (${projectId}, ${input.item_id}, ${input.region_id ?? null},
       ${input.quantity}, ${input.base_unit_price},
       ${input.procurement_month ?? null}, ${input.note ?? null})
    RETURNING id
  `;
  return row.id;
}

export async function updateProjectItem(
  sql: Sql,
  projectId: string,
  itemId: string,
  input: z.infer<typeof projectItemPatchSchema>
) {
  const cur = await sql`
    SELECT * FROM project_items WHERE id = ${itemId} AND project_id = ${projectId}
  `;
  if (cur.length === 0) return null;
  const c = cur[0];
  await sql`
    UPDATE project_items SET
      item_id = ${input.item_id ?? c.item_id},
      region_id = ${input.region_id !== undefined ? input.region_id : c.region_id},
      quantity = ${input.quantity ?? c.quantity},
      base_unit_price = ${input.base_unit_price ?? c.base_unit_price},
      procurement_month = ${input.procurement_month !== undefined ? input.procurement_month : c.procurement_month},
      note = ${input.note !== undefined ? input.note : c.note},
      updated_at = now()
    WHERE id = ${itemId} AND project_id = ${projectId}
  `;
  return itemId;
}

export async function deleteProjectItem(sql: Sql, projectId: string, itemId: string) {
  const [row] = await sql`
    DELETE FROM project_items WHERE id = ${itemId} AND project_id = ${projectId}
    RETURNING id
  `;
  return row ?? null;
}

type Scenario = { name: string; delta: number };

async function fetchIndexRates(
  sql: Sql,
  regionIds: (string | null)[],
  indexItemId: string | null,
  basePeriod: string | null,
  procurementMonths: (string | null)[]
): Promise<Map<string, number | null>> {
  const rates = new Map<string, number | null>();
  if (!indexItemId) return rates;
  const targetMonths = [...new Set(procurementMonths.filter((m): m is string => !!m))];
  if (targetMonths.length === 0) return rates;
  const base = basePeriod ?? "2025-01";
  const regionRows = await sql`
    SELECT id, region_code FROM regions
    WHERE id = ANY(${regionIds.filter((r): r is string => !!r)}) OR region_code = 'JP-01'
  `;
  const national = regionRows.find((r) => r.region_code === "JP-01");
  const regionIdByCode = new Map(regionRows.map((r) => [String(r.region_code), String(r.id)]));
  const periods = [base, ...targetMonths];
  const rows = await sql`
    SELECT to_char(t.period_date, 'YYYY-MM') AS period, t.region_id, t.value::text AS value
    FROM time_series_values t
    WHERE t.item_id = ${indexItemId}
      AND t.region_id = ANY(${[...regionIdByCode.values()]})
      AND to_char(t.period_date, 'YYYY-MM') = ANY(${periods})
    ORDER BY t.period_date
  `;
  const byRegion = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = String(r.region_id);
    if (!byRegion.has(key)) byRegion.set(key, new Map());
    byRegion.get(key)!.set(String(r.period), Number(r.value));
  }
  const nationalId = national ? String(national.id) : undefined;
  const uniqueTargets = [...new Set(procurementMonths.map((m) => m ?? ""))];
  for (const regionId of new Set(regionIds.map((r) => r ?? ""))) {
    for (const month of uniqueTargets) {
      const key = `${regionId}|${month}`;
      const regionKey = regionId || nationalId || "";
      const series =
        byRegion.get(regionKey) ??
        (nationalId ? byRegion.get(nationalId) : undefined) ??
        new Map<string, number>();
      const baseVal = series.get(base);
      const targetVal = month ? series.get(month) : undefined;
      if (baseVal != null && targetVal != null && baseVal !== 0) {
        rates.set(key, targetVal / baseVal - 1);
      }
    }
  }
  return rates;
}

export async function simulateProject(
  sql: Sql,
  projectId: string,
  input: z.infer<typeof simulationSchema>
) {
  const project = await getProject(sql, projectId);
  if (!project) return null;
  if (project.items.length === 0) {
    const err = new Error("案件に明細（数量・基準単価）が登録されていません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const scenarios: Scenario[] = input.scenarios ?? [
    { name: "下振れ", delta: -0.1 },
    { name: "標準", delta: 0 },
    { name: "上振れ", delta: 0.1 },
  ];
  const indexRates = await fetchIndexRates(
    sql,
    project.items.map((i) => i.region_id ?? null),
    input.index_item_id ?? null,
    input.base_period ?? null,
    project.items.map((i) => i.procurement_month ?? null)
  );

  const warnings: string[] = [];
  const scenarioRows = scenarios.map((sc) => {
    const itemRows = project.items.map((item) => {
      const month = item.procurement_month ?? null;
      const key = `${item.region_id ?? ""}|${month ?? ""}`;
      const actualRate = indexRates.get(key) ?? null;
      const rate = actualRate != null ? actualRate + sc.delta : sc.delta;
      if (actualRate == null && input.index_item_id && month) {
        warnings.push(`${item.item_name}: 指数データ不足のためシナリオ係数のみで計算しました。`);
      }
      const baseAmount = Number(item.quantity) * Number(item.base_unit_price);
      return {
        item_id: item.item_id,
        item_name: item.item_name,
        data_kind: item.data_kind,
        estimate_usable: item.estimate_usable,
        region_name: item.region_name ?? null,
        procurement_month: month,
        quantity: Number(item.quantity),
        base_unit_price: Number(item.base_unit_price),
        base_amount: baseAmount,
        actual_rate: actualRate,
        scenario_delta: sc.delta,
        effective_rate: rate,
        impact_amount: baseAmount * rate,
        projected_unit_price: Number(item.base_unit_price) * (1 + rate),
      };
    });
    const totalBase = itemRows.reduce((a, r) => a + r.base_amount, 0);
    const totalImpact = itemRows.reduce((a, r) => a + r.impact_amount, 0);
    return {
      name: sc.name,
      delta: sc.delta,
      items: itemRows,
      total_base: totalBase,
      total_impact: totalImpact,
      total_projected: totalBase + totalImpact,
    };
  });

  const monthlyMap = new Map<string, Map<string, number>>();
  for (const sc of scenarioRows) {
    const byMonth = new Map<string, number>();
    for (const item of sc.items) {
      const month = item.procurement_month ?? "未定";
      byMonth.set(month, (byMonth.get(month) ?? 0) + item.impact_amount);
    }
    for (const [month, amount] of byMonth) {
      if (!monthlyMap.has(month)) monthlyMap.set(month, new Map());
      monthlyMap.get(month)!.set(sc.name, amount);
    }
  }
  const monthly = [...monthlyMap.entries()]
    .sort((a, b) => (a[0] === "未定" ? 1 : b[0] === "未定" ? -1 : a[0].localeCompare(b[0])))
    .map(([period, byScenario]) => ({
      period,
      impacts: Object.fromEntries(byScenario) as Record<string, number>,
    }));

  return {
    project: { id: project.id, name: project.name, status: project.status },
    index_item_id: input.index_item_id ?? null,
    base_period: input.base_period ?? null,
    scenarios: scenarioRows,
    monthly,
    warnings: [...new Set(warnings)],
  };
}
