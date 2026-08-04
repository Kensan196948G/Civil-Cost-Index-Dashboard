import { z } from "zod";
import type { Sql } from "../lib/db";
import { estimatePortCost, type VesselInput } from "../lib/portCost";
import type { CsvRow } from "../lib/csv";

export const portEstimateSchema = z.object({
  work_type_id: z.string().min(1),
  quantity: z.number().positive(),
  operation_rate: z.number().min(0.1).max(1).optional(),
  mobilization_days: z.number().int().min(0).max(60).optional(),
});

export async function listVessels(sql: Sql) {
  const rows = await sql`
    SELECT id, vessel_code, vessel_name, category, capacity, capacity_unit,
           hire_rate_per_day, availability_factor, mobilization_days, standby_rate,
           is_active, note, created_at, updated_at
    FROM vessels
    WHERE is_active = true
    ORDER BY category, vessel_code
  `;
  return rows.map((r) => ({
    id: r.id,
    vessel_code: r.vessel_code,
    vessel_name: r.vessel_name,
    category: r.category,
    capacity: r.capacity != null ? Number(r.capacity) : null,
    capacity_unit: r.capacity_unit,
    hire_rate_per_day: Number(r.hire_rate_per_day),
    availability_factor: Number(r.availability_factor),
    mobilization_days: r.mobilization_days,
    standby_rate: Number(r.standby_rate),
    is_active: r.is_active,
    note: r.note,
  }));
}

export async function listWorkTypes(sql: Sql) {
  const types = await sql`
    SELECT id, work_type_code, work_type_name, unit, description, is_active
    FROM port_work_types
    WHERE is_active = true
    ORDER BY work_type_code
  `;
  const vesselRows = await sql`
    SELECT wv.work_type_id, wv.quantity_per_unit, wv.is_primary,
           v.id AS vessel_id, v.vessel_code, v.vessel_name, v.category,
           v.capacity, v.capacity_unit, v.hire_rate_per_day, v.availability_factor,
           v.mobilization_days, v.standby_rate
    FROM port_work_type_vessels wv
    JOIN vessels v ON v.id = wv.vessel_id
    WHERE v.is_active = true
    ORDER BY wv.work_type_id, wv.is_primary DESC, v.vessel_code
  `;
  return types.map((t) => ({
    id: t.id,
    work_type_code: t.work_type_code,
    work_type_name: t.work_type_name,
    unit: t.unit,
    description: t.description,
    vessels: vesselRows
      .filter((v) => String(v.work_type_id) === String(t.id))
      .map((v) => ({
        quantity_per_unit: Number(v.quantity_per_unit),
        is_primary: v.is_primary,
        vessel: {
          vessel_code: v.vessel_code,
          vessel_name: v.vessel_name,
          category: v.category,
          capacity: v.capacity != null ? Number(v.capacity) : null,
          capacity_unit: v.capacity_unit,
          hire_rate_per_day: Number(v.hire_rate_per_day),
          availability_factor: Number(v.availability_factor),
          mobilization_days: v.mobilization_days,
          standby_rate: Number(v.standby_rate),
        } satisfies VesselInput,
      })),
  }));
}

export async function estimatePort(sql: Sql, input: z.infer<typeof portEstimateSchema>) {
  const [workType] = await sql`
    SELECT id, work_type_code, work_type_name, unit FROM port_work_types
    WHERE id = ${input.work_type_id} AND is_active = true
  `;
  if (!workType) {
    const err = new Error("港湾工種が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const all = await listWorkTypes(sql);
  const wt = all.find((t) => String(t.id) === String(workType.id));
  if (!wt) {
    const err = new Error("港湾工種の構成データがありません。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const result = estimatePortCost({
    workTypeName: wt.work_type_name,
    unit: wt.unit,
    quantity: input.quantity,
    vessels: wt.vessels,
    operationRate: input.operation_rate,
    mobilizationDays: input.mobilization_days,
  });
  return {
    work_type: { id: workType.id, code: workType.work_type_code, name: workType.work_type_name, unit: workType.unit },
    quantity: input.quantity,
    result,
  };
}

function headerValue(row: CsvRow, keys: string[]): string {
  for (const k of keys) {
    const found = Object.entries(row).find(([key]) => key.trim().toLowerCase() === k.toLowerCase());
    if (found && found[1] !== undefined && String(found[1]).trim() !== "") return String(found[1]).trim();
  }
  return "";
}

export async function importVessels(
  sql: Sql,
  input: { rows: CsvRow[] }
): Promise<{ imported: number; errors: Array<{ row: number; column: string; reason: string }> }> {
  const { rows } = input;
  const errors: Array<{ row: number; column: string; reason: string }> = [];
  let imported = 0;
  for (const [i, row] of rows.entries()) {
    const rowNo = i + 2;
    const vesselCode = headerValue(row, ["vessel_code", "船舶コード"]);
    const name = headerValue(row, ["vessel_name", "船舶名", "名称"]);
    const category = headerValue(row, ["category", "区分"]) || "その他";
    const capacityRaw = headerValue(row, ["capacity", "能力"]);
    const capacityUnit = headerValue(row, ["capacity_unit", "能力単位"]);
    const hireRaw = headerValue(row, ["hire_rate_per_day", "損料（円/日）", "損料"]);
    const availabilityRaw = headerValue(row, ["availability_factor", "供用係数", "稼働率"]);
    const mobilizationRaw = headerValue(row, ["mobilization_days", "回航日数"]);
    const standbyRaw = headerValue(row, ["standby_rate", "待機率"]);
    const note = headerValue(row, ["note", "備考"]);
    const capacity = capacityRaw ? Number(capacityRaw) : null;
    const hire = Number(hireRaw);
    const availability = availabilityRaw ? Number(availabilityRaw) : 0.7;
    const mobilization = mobilizationRaw ? Number(mobilizationRaw) : 2;
    const standby = standbyRaw ? Number(standbyRaw) : 0.5;
    if (!vesselCode || !name || !Number.isFinite(hire)) {
      errors.push({ row: rowNo, column: "船舶", reason: "vessel_code・vessel_name・損料が必須です" });
      continue;
    }
    if (capacityRaw && !Number.isFinite(capacity as number)) {
      errors.push({ row: rowNo, column: "能力", reason: "能力が数値ではありません" });
      continue;
    }
    await sql`
      INSERT INTO vessels
        (vessel_code, vessel_name, category, capacity, capacity_unit, hire_rate_per_day,
         availability_factor, mobilization_days, standby_rate, note, updated_at)
      VALUES
        (${vesselCode}, ${name}, ${category}, ${capacity}, ${capacityUnit || null},
         ${hire}, ${availability}, ${mobilization}, ${standby}, ${note || null}, now())
      ON CONFLICT (vessel_code) DO UPDATE SET
        vessel_name = EXCLUDED.vessel_name,
        category = EXCLUDED.category,
        capacity = EXCLUDED.capacity,
        capacity_unit = EXCLUDED.capacity_unit,
        hire_rate_per_day = EXCLUDED.hire_rate_per_day,
        availability_factor = EXCLUDED.availability_factor,
        mobilization_days = EXCLUDED.mobilization_days,
        standby_rate = EXCLUDED.standby_rate,
        note = EXCLUDED.note,
        updated_at = now()
    `;
    imported++;
  }
  return { imported, errors };
}

export async function listSeaConditions(sql: Sql, seaAreaCode?: string) {
  const rows = seaAreaCode
    ? await sql`
        SELECT id, sea_area_code, sea_area_name, target_month, wave_height_limit,
               wind_speed_limit, turbidity_allowed, navigation_restriction,
               workable_days, calendar_days, note, updated_at
        FROM port_sea_conditions
        WHERE sea_area_code = ${seaAreaCode}
        ORDER BY target_month
      `
    : await sql`
        SELECT id, sea_area_code, sea_area_name, target_month, wave_height_limit,
               wind_speed_limit, turbidity_allowed, navigation_restriction,
               workable_days, calendar_days, note, updated_at
        FROM port_sea_conditions
        ORDER BY sea_area_code, target_month
      `;
  return rows;
}

export async function upsertSeaCondition(
  sql: Sql,
  input: z.infer<typeof seaConditionSchema>
) {
  const [row] = await sql`
    INSERT INTO port_sea_conditions
      (sea_area_code, sea_area_name, target_month, wave_height_limit, wind_speed_limit,
       turbidity_allowed, navigation_restriction, workable_days, calendar_days, note)
    VALUES
      (${input.sea_area_code}, ${input.sea_area_name}, ${input.target_month},
       ${input.wave_height_limit ?? null}, ${input.wind_speed_limit ?? null},
       ${input.turbidity_allowed ?? true}, ${input.navigation_restriction ?? null},
       ${input.workable_days}, ${input.calendar_days ?? 30}, ${input.note ?? null})
    ON CONFLICT (sea_area_code, target_month) DO UPDATE SET
      sea_area_name = EXCLUDED.sea_area_name,
      wave_height_limit = EXCLUDED.wave_height_limit,
      wind_speed_limit = EXCLUDED.wind_speed_limit,
      turbidity_allowed = EXCLUDED.turbidity_allowed,
      navigation_restriction = EXCLUDED.navigation_restriction,
      workable_days = EXCLUDED.workable_days,
      calendar_days = EXCLUDED.calendar_days,
      note = EXCLUDED.note,
      updated_at = now()
    RETURNING id
  `;
  return row.id;
}

export const seaConditionSchema = z.object({
  sea_area_code: z.string().min(1).max(50),
  sea_area_name: z.string().min(1).max(200),
  target_month: z.number().int().min(1).max(12),
  wave_height_limit: z.number().min(0).optional().nullable(),
  wind_speed_limit: z.number().min(0).optional().nullable(),
  turbidity_allowed: z.boolean().optional(),
  navigation_restriction: z.string().max(100).optional().nullable(),
  workable_days: z.number().int().min(0).max(31),
  calendar_days: z.number().int().min(1).max(31).optional(),
  note: z.string().optional().nullable(),
});

export async function computeWorkability(
  sql: Sql,
  input: { sea_area_code: string; target_month: number; wave_height?: number | null; wind_speed?: number | null }
) {
  const rows = await sql`
    SELECT * FROM port_sea_conditions
    WHERE sea_area_code = ${input.sea_area_code} AND target_month = ${input.target_month}
  `;
  if (rows.length === 0) {
    const err = new Error("指定した海域・月の海象条件が未登録です。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const c = rows[0];
  const warnings: string[] = [];
  let adjusted = Number(c.workable_days);
  if (input.wave_height != null && c.wave_height_limit != null && input.wave_height > Number(c.wave_height_limit)) {
    adjusted = Math.round(adjusted * 0.6);
    warnings.push(`波高 ${input.wave_height}m が作業限界（${c.wave_height_limit}m）を超過。施工可能日数を60%に減じました。`);
  }
  if (input.wind_speed != null && c.wind_speed_limit != null && input.wind_speed > Number(c.wind_speed_limit)) {
    adjusted = Math.round(adjusted * 0.7);
    warnings.push(`風速 ${input.wind_speed}m/s が作業限界（${c.wind_speed_limit}m/s）を超過。施工可能日数を70%に減じました。`);
  }
  const calendarDays = Number(c.calendar_days) || 30;
  const operationRate = Math.min(1, Math.max(0.1, adjusted / calendarDays));
  return {
    sea_area_code: c.sea_area_code,
    sea_area_name: c.sea_area_name,
    target_month: input.target_month,
    workable_days_base: Number(c.workable_days),
    workable_days: adjusted,
    calendar_days: calendarDays,
    operation_rate: Math.round(operationRate * 1000) / 1000,
    conditions: {
      wave_height_limit: c.wave_height_limit,
      wind_speed_limit: c.wind_speed_limit,
      turbidity_allowed: c.turbidity_allowed,
      navigation_restriction: c.navigation_restriction,
    },
    warnings,
  };
}
