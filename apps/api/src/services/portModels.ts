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

export const soilTypeSchema = z.object({
  soil_code: z.string().min(1).max(50),
  soil_name: z.string().min(1).max(200),
  dredging_correction_factor: z.number().min(0.5).max(3).default(1),
  note: z.string().optional().nullable(),
});

export const transportRateSchema = z.object({
  distance_km: z.number().positive(),
  transport_coefficient: z.number().min(0.5).max(3).default(1),
  note: z.string().optional().nullable(),
});

export const spoilGroundSchema = z.object({
  spoil_code: z.string().min(1).max(50),
  spoil_name: z.string().min(1).max(200),
  area_name: z.string().max(200).optional().nullable(),
  distance_km: z.number().nonnegative().optional().nullable(),
  disposal_unit_price: z.number().nonnegative().default(0),
  note: z.string().optional().nullable(),
});

export async function listSoilTypes(sql: Sql) {
  return sql`SELECT id, soil_code, soil_name, dredging_correction_factor, note, updated_at FROM soil_types ORDER BY soil_code`;
}

export async function upsertSoilType(sql: Sql, input: z.infer<typeof soilTypeSchema>) {
  const [row] = await sql`
    INSERT INTO soil_types (soil_code, soil_name, dredging_correction_factor, note)
    VALUES (${input.soil_code}, ${input.soil_name}, ${input.dredging_correction_factor}, ${input.note ?? null})
    ON CONFLICT (soil_code) DO UPDATE SET
      soil_name = EXCLUDED.soil_name,
      dredging_correction_factor = EXCLUDED.dredging_correction_factor,
      note = EXCLUDED.note,
      updated_at = now()
    RETURNING id
  `;
  return row.id;
}

export async function listTransportRates(sql: Sql) {
  return sql`SELECT id, distance_km, transport_coefficient, note, updated_at FROM dredging_transport_rates ORDER BY distance_km`;
}

export async function upsertTransportRate(sql: Sql, input: z.infer<typeof transportRateSchema>) {
  const [row] = await sql`
    INSERT INTO dredging_transport_rates (distance_km, transport_coefficient, note)
    VALUES (${input.distance_km}, ${input.transport_coefficient}, ${input.note ?? null})
    ON CONFLICT (distance_km) DO UPDATE SET
      transport_coefficient = EXCLUDED.transport_coefficient,
      note = EXCLUDED.note,
      updated_at = now()
    RETURNING id
  `;
  return row.id;
}

export async function listSpoilGrounds(sql: Sql) {
  return sql`SELECT id, spoil_code, spoil_name, area_name, distance_km, disposal_unit_price, note, updated_at FROM spoil_grounds ORDER BY spoil_code`;
}

export async function upsertSpoilGround(sql: Sql, input: z.infer<typeof spoilGroundSchema>) {
  const [row] = await sql`
    INSERT INTO spoil_grounds (spoil_code, spoil_name, area_name, distance_km, disposal_unit_price, note)
    VALUES (${input.spoil_code}, ${input.spoil_name}, ${input.area_name ?? null},
            ${input.distance_km ?? null}, ${input.disposal_unit_price}, ${input.note ?? null})
    ON CONFLICT (spoil_code) DO UPDATE SET
      spoil_name = EXCLUDED.spoil_name,
      area_name = EXCLUDED.area_name,
      distance_km = EXCLUDED.distance_km,
      disposal_unit_price = EXCLUDED.disposal_unit_price,
      note = EXCLUDED.note,
      updated_at = now()
    RETURNING id
  `;
  return row.id;
}

export async function resolveDredgingOptions(
  sql: Sql,
  opts: {
    soil_type_code?: string | null;
    spoil_ground_code?: string | null;
    transport_distance_km?: number | null;
  }
): Promise<{
  soil_factor: number;
  soil_type_code: string | null;
  spoil_unit_price: number;
  spoil_ground_code: string | null;
  transport_coefficient: number;
  transport_distance_km: number | null;
}> {
  let soilFactor = 1;
  const soilTypeCode: string | null = opts.soil_type_code ?? null;
  if (opts.soil_type_code) {
    const rows = await sql`SELECT dredging_correction_factor FROM soil_types WHERE soil_code = ${opts.soil_type_code}`;
    if (rows.length > 0) soilFactor = Number(rows[0].dredging_correction_factor);
  }
  let spoilUnitPrice = 0;
  const spoilGroundCode: string | null = opts.spoil_ground_code ?? null;
  if (opts.spoil_ground_code) {
    const rows = await sql`SELECT disposal_unit_price FROM spoil_grounds WHERE spoil_code = ${opts.spoil_ground_code}`;
    if (rows.length > 0) spoilUnitPrice = Number(rows[0].disposal_unit_price);
  }
  let transportCoefficient = 1;
  const distanceKm = opts.transport_distance_km ?? null;
  if (distanceKm != null) {
    const rows = await sql`
      SELECT transport_coefficient FROM dredging_transport_rates
      WHERE distance_km <= ${distanceKm}
      ORDER BY distance_km DESC LIMIT 1
    `;
    if (rows.length > 0) transportCoefficient = Number(rows[0].transport_coefficient);
  }
  return {
    soil_factor: soilFactor,
    soil_type_code: soilTypeCode,
    spoil_unit_price: spoilUnitPrice,
    spoil_ground_code: spoilGroundCode,
    transport_coefficient: transportCoefficient,
    transport_distance_km: distanceKm,
  };
}

export const shiftRuleSchema = z.object({
  rule_code: z.string().min(1).max(50),
  rule_name: z.string().min(1).max(200),
  shift_type: z.enum(["night", "rotation", "overtime"]),
  time_from: z.string().max(5).optional().nullable(),
  time_to: z.string().max(5).optional().nullable(),
  labor_surcharge_rate: z.number().min(0).max(3).default(0),
  machinery_surcharge_rate: z.number().min(0).max(3).default(0),
  conditions_json: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
  note: z.string().optional().nullable(),
});

export async function listShiftRules(sql: Sql) {
  return sql`
    SELECT id, rule_code, rule_name, shift_type, time_from, time_to,
           labor_surcharge_rate, machinery_surcharge_rate, conditions_json,
           is_active, note, updated_at
    FROM work_shift_rules
    WHERE is_active = true
    ORDER BY shift_type, rule_code
  `;
}

export async function upsertShiftRule(sql: Sql, input: z.infer<typeof shiftRuleSchema>) {
  const [row] = await sql`
    INSERT INTO work_shift_rules
      (rule_code, rule_name, shift_type, time_from, time_to,
       labor_surcharge_rate, machinery_surcharge_rate, conditions_json, is_active, note)
    VALUES
      (${input.rule_code}, ${input.rule_name}, ${input.shift_type},
       ${input.time_from ?? null}, ${input.time_to ?? null},
       ${input.labor_surcharge_rate}, ${input.machinery_surcharge_rate},
       ${JSON.stringify(input.conditions_json ?? {})}, ${input.is_active ?? true},
       ${input.note ?? null})
    ON CONFLICT (rule_code) DO UPDATE SET
      rule_name = EXCLUDED.rule_name,
      shift_type = EXCLUDED.shift_type,
      time_from = EXCLUDED.time_from,
      time_to = EXCLUDED.time_to,
      labor_surcharge_rate = EXCLUDED.labor_surcharge_rate,
      machinery_surcharge_rate = EXCLUDED.machinery_surcharge_rate,
      conditions_json = EXCLUDED.conditions_json,
      is_active = EXCLUDED.is_active,
      note = EXCLUDED.note,
      updated_at = now()
    RETURNING id
  `;
  return row.id;
}

export async function resolveShiftRules(sql: Sql, codes: string[]) {
  if (codes.length === 0) {
    return { shift_rules: [], shift_labor_surcharge: 0, shift_machinery_surcharge: 0 };
  }
  const rows = await sql`
    SELECT rule_code, rule_name, shift_type, time_from, time_to,
           labor_surcharge_rate, machinery_surcharge_rate
    FROM work_shift_rules
    WHERE rule_code = ANY(${codes}) AND is_active = true
  `;
  const labor = rows.reduce((a, r) => a + Number(r.labor_surcharge_rate), 0);
  const machinery = rows.reduce((a, r) => a + Number(r.machinery_surcharge_rate), 0);
  return {
    shift_rules: rows.map((r) => ({
      code: r.rule_code,
      name: r.rule_name,
      shift_type: r.shift_type,
      time_from: r.time_from,
      time_to: r.time_to,
      labor_surcharge_rate: Number(r.labor_surcharge_rate),
      machinery_surcharge_rate: Number(r.machinery_surcharge_rate),
    })),
    shift_labor_surcharge: labor,
    shift_machinery_surcharge: machinery,
  };
}

export async function portReadiness(sql: Sql) {
  const count = async (table: string) => {
    const rows = await sql(`SELECT count(*)::int AS c FROM ${table}`);
    return rows[0].c as number;
  };
  const [vessels, trees, breakdowns, seaMonths, rates, soil, transport, spoil] = await Promise.all([
    count("vessels"),
    count("work_type_trees"),
    count("work_breakdowns"),
    count("port_sea_conditions"),
    count("overhead_rates"),
    count("soil_types"),
    count("dredging_transport_rates"),
    count("spoil_grounds"),
  ]);
  const items = [
    { key: "vessels", label: "作業船マスタ", current: vessels, required: 5 },
    { key: "trees", label: "工種体系（港湾）", current: trees, required: 3 },
    { key: "breakdowns", label: "歩掛（港湾）", current: breakdowns, required: 3 },
    { key: "sea_months", label: "海象条件（海域×月）", current: seaMonths, required: 12 },
    { key: "overhead_rates", label: "港湾諸経費率", current: rates, required: 3 },
    { key: "soil_types", label: "土質マスタ", current: soil, required: 1 },
    { key: "transport_rates", label: "運搬距離係数", current: transport, required: 1 },
    { key: "spoil_grounds", label: "土捨場・処分場", current: spoil, required: 1 },
  ];
  const ok = items.every((i) => i.current >= i.required);
  return {
    ready: ok,
    checklist: items.map((i) => ({ ...i, ok: i.current >= i.required })),
    note: ok
      ? "港湾積算のPoC計算に必要なマスタが揃っています。正式な令和8年度係数データへの置き換えを継続してください。"
      : "マスタが不足しています。3経路の取込で係数データを投入してください。",
  };
}
