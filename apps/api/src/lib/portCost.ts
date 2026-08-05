export type VesselInput = {
  vessel_code: string;
  vessel_name: string;
  category: string;
  capacity: number | null;
  capacity_unit: string | null;
  hire_rate_per_day: number;
  availability_factor: number;
  mobilization_days: number;
  standby_rate: number;
};

export type WorkTypeVesselInput = {
  vessel: VesselInput;
  quantity_per_unit: number;
  is_primary: boolean;
};

export type PortEstimateResult = {
  operation_rate: number;
  mobilization_days: number;
  rows: Array<{
    vessel_code: string;
    vessel_name: string;
    category: string;
    daily_output: number;
    work_days: number;
    standby_days: number;
    hire_cost: number;
    mobilization_cost: number;
    total_cost: number;
  }>;
  total_cost: number;
  assumptions: string[];
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function estimatePortCost(input: {
  workTypeName: string;
  unit: string;
  quantity: number;
  vessels: WorkTypeVesselInput[];
  operationRate?: number;
  mobilizationDays?: number;
}): PortEstimateResult {
  const operationRate = clamp(input.operationRate ?? 0.7, 0.1, 1.0);
  const mobilizationDays = Math.max(0, Math.floor(input.mobilizationDays ?? 2));
  const rows = input.vessels.map(({ vessel, quantity_per_unit }) => {
    const capacity = vessel.capacity ?? 1;
    const dailyOutput = capacity * operationRate;
    const workDays = Math.max(1, Math.ceil((input.quantity * quantity_per_unit) / dailyOutput));
    const standbyDays = Math.max(0, Math.ceil(workDays * (1 - vessel.availability_factor)));
    const hireCost = (workDays + standbyDays) * vessel.hire_rate_per_day;
    const mobilizationCost = mobilizationDays * vessel.hire_rate_per_day;
    return {
      vessel_code: vessel.vessel_code,
      vessel_name: vessel.vessel_name,
      category: vessel.category,
      daily_output: dailyOutput,
      work_days: workDays,
      standby_days: standbyDays,
      hire_cost: hireCost,
      mobilization_cost: mobilizationCost,
      total_cost: hireCost + mobilizationCost,
    };
  });
  const totalCost = rows.reduce((a, r) => a + r.total_cost, 0);
  return {
    operation_rate: operationRate,
    mobilization_days: mobilizationDays,
    rows,
    total_cost: totalCost,
    assumptions: [
      `稼働率（海上施工可能日数を加味した実働率）: ${(operationRate * 100).toFixed(0)}%`,
      `待機・拘束日数 = 稼働日数 × (1 - 供用係数) として算定`,
      `回航・えい航費 = 回航日数（${mobilizationDays}日）× 船舶損料`,
      `${input.workTypeName}の単位: ${input.unit}`,
      "PoC用の仮定値です。港湾請負工事積算基準（令和8年度）の正式な船舶損料・歩掛・海域条件補正に置き換える必要があります。",
    ],
  };
}
