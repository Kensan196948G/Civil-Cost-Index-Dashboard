import { z } from "zod";
import type { Sql } from "../lib/db";
import { estimatePortCost, type VesselInput } from "../lib/portCost";

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
