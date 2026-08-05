/**
 * 積算計算エンジン（純粋関数・再現可能）
 * 計算: 数量 × 歩掛明細 × 単価 → 直接工事費 → 共通仮設費 → 現場管理費 → 一般管理費等 → 消費税
 * 端数処理は積算基準ごとのルールで行う。
 */

export type ResourceItem = {
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  /** 港湾作業船の場合に vessels マスタを参照するためのコード */
  vessel_id?: string;
};

export type BreakdownInput = {
  id?: string;
  condition_json: Record<string, unknown>;
  labor: ResourceItem[];
  material: ResourceItem[];
  machinery: ResourceItem[];
};

export type QuantityInput = {
  tree_id: string;
  tree_code: string;
  tree_name: string;
  unit: string;
  quantity: number;
  condition_json: Record<string, unknown>;
};

export type RateSet = {
  common_temp: number;
  site_management: number;
  general_management: number;
};

export type RoundingRules = Record<string, string>;

export type VesselInfo = {
  capacity: number;
  availability_factor: number;
  mobilization_days: number;
  standby_rate: number;
  hire_rate_per_day: number;
};

export type PortOptions = {
  operation_rate: number;
  mobilization_days?: number | null;
  soil_correction: number;
  night_surcharge: number;
  /** 土質補正係数（マスタ由来・乗算） */
  soil_factor?: number;
  /** 運搬距離補正係数（マスタ由来・乗算） */
  transport_coefficient?: number;
  /** 土捨場・処分場の処分単価（円/m3） */
  spoil_unit_price?: number;
  soil_type_code?: string | null;
  spoil_ground_code?: string | null;
  transport_distance_km?: number | null;
  /** 適用する補正ルールコード（夜間/交代制/超勤） */
  shift_rules?: string[];
  /** 労務補正率合計（ルールマスタから解決） */
  shift_labor_surcharge?: number;
  /** 機械補正率合計（ルールマスタから解決） */
  shift_machinery_surcharge?: number;
};

export type PortExtras = {
  operation_rate: number;
  work_days: number;
  standby_days: number;
  mobilization_days: number;
  mobilization_cost: number;
  soil_correction: number;
  night_surcharge: number;
  soil_factor: number;
  transport_coefficient: number;
  soil_type_code: string | null;
  spoil_ground_code: string | null;
  transport_distance_km: number | null;
  disposal_cost: number;
  shift_labor_surcharge: number;
  shift_machinery_surcharge: number;
  shift_rules: string[];
};

export type EstimateLineResult = {
  tree_id: string;
  tree_code: string;
  tree_name: string;
  unit: string;
  quantity: number;
  breakdown_id: string | null;
  labor_cost: number;
  material_cost: number;
  machinery_cost: number;
  direct_cost: number;
  note: string | null;
};

export type EstimateMaterialResult = {
  line_index: number;
  resource_type: "labor" | "material" | "machinery";
  resource_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type EstimateResult = {
  lines: EstimateLineResult[];
  materials: EstimateMaterialResult[];
  direct_cost: number;
  common_temp_cost: number;
  site_management_cost: number;
  general_management_cost: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  warnings: string[];
  port_extras: PortExtras | null;
};

export function applyRounding(value: number, rule: string | undefined): number {
  const v = Number.isFinite(value) ? value : 0;
  switch (rule) {
    case "yen_round":
      return Math.round(v);
    case "yen_up":
      return Math.ceil(v);
    case "ten_down":
      return Math.floor(v / 10) * 10;
    case "ten_round":
      return Math.round(v / 10) * 10;
    case "ten_up":
      return Math.ceil(v / 10) * 10;
    case "hundred_down":
      return Math.floor(v / 100) * 100;
    case "hundred_round":
      return Math.round(v / 100) * 100;
    case "hundred_up":
      return Math.ceil(v / 100) * 100;
    case "thousand_down":
      return Math.floor(v / 1000) * 1000;
    case "thousand_round":
      return Math.round(v / 1000) * 1000;
    case "thousand_up":
      return Math.ceil(v / 1000) * 1000;
    case "yen_down":
    default:
      return Math.floor(v);
  }
}

export function conditionsMatch(
  candidate: Record<string, unknown>,
  target: Record<string, unknown>
): boolean {
  for (const [k, v] of Object.entries(candidate)) {
    if (target[k] !== v) return false;
  }
  return true;
}

export function findBreakdown(
  breakdowns: BreakdownInput[],
  targetCondition: Record<string, unknown>
): BreakdownInput | null {
  const exact = breakdowns.find(
    (b) => JSON.stringify(b.condition_json) === JSON.stringify(targetCondition)
  );
  if (exact) return exact;
  const subset = breakdowns.find((b) => conditionsMatch(b.condition_json, targetCondition));
  if (subset) return subset;
  return breakdowns.find((b) => Object.keys(b.condition_json).length === 0) ?? null;
}

function resourceAmount(quantity: number, res: ResourceItem): number {
  return quantity * (res.quantity ?? 0) * (res.unit_price ?? 0);
}

export function computeEstimate(input: {
  quantities: QuantityInput[];
  breakdownsByTree: Map<string, BreakdownInput[]>;
  rates: RateSet;
  rounding: RoundingRules;
  taxRate?: number;
  vessels?: Map<string, VesselInfo>;
  port?: PortOptions;
}): EstimateResult {
  const taxRate = input.taxRate ?? 0.1;
  const warnings: string[] = [];
  const lines: EstimateLineResult[] = [];
  const materials: EstimateMaterialResult[] = [];
  let portWorkDays = 0;
  let portStandbyDays = 0;
  let portMobilizationCost = 0;
  let disposalCost = 0;

  for (const q of input.quantities) {
    const candidates = input.breakdownsByTree.get(q.tree_id) ?? [];
    const breakdown = findBreakdown(candidates, q.condition_json);
    if (!breakdown) {
      warnings.push(`${q.tree_name}: 適用可能な歩掛がありません（数量 ${q.quantity} ${q.unit}）。`);
      lines.push({
        tree_id: q.tree_id,
        tree_code: q.tree_code,
        tree_name: q.tree_name,
        unit: q.unit,
        quantity: q.quantity,
        breakdown_id: null,
        labor_cost: 0,
        material_cost: 0,
        machinery_cost: 0,
        direct_cost: 0,
        note: "歩掛なし",
      });
      continue;
    }
    let laborCost = 0;
    let materialCost = 0;
    let machineryCost = 0;
    const pushMaterials = (
      type: "labor" | "material" | "machinery",
      items: ResourceItem[]
    ) => {
      for (const res of items) {
        let amount: number;
        if (type === "machinery" && res.vessel_id && input.vessels?.has(res.vessel_id)) {
          const v = input.vessels.get(res.vessel_id)!;
          const port = input.port ?? { operation_rate: 0.7, soil_correction: 0, night_surcharge: 0 };
          const capacity = v.capacity > 0 ? v.capacity : 1;
          const dailyOutput = capacity * port.operation_rate;
          const workDays = Math.max(1, Math.ceil((q.quantity * (res.quantity || 1)) / dailyOutput));
          const standbyDays = Math.max(
            0,
            Math.ceil(workDays * (1 - v.availability_factor) - 1e-9)
          );
          const mobDays = port.mobilization_days ?? v.mobilization_days ?? 0;
          const rate = res.unit_price || v.hire_rate_per_day;
          amount = (workDays + standbyDays) * rate + mobDays * rate;
          portWorkDays += workDays;
          portStandbyDays += standbyDays;
          portMobilizationCost += mobDays * rate;
        } else {
          amount = resourceAmount(q.quantity, res);
        }
        materials.push({
          line_index: lines.length,
          resource_type: type,
          resource_name: res.name,
          unit: res.unit,
          quantity: q.quantity * (res.quantity ?? 0),
          unit_price: res.unit_price,
          amount,
        });
        if (type === "labor") laborCost += amount;
        else if (type === "material") materialCost += amount;
        else machineryCost += amount;
      }
    };
    pushMaterials("labor", breakdown.labor);
    pushMaterials("material", breakdown.material);
    pushMaterials("machinery", breakdown.machinery);
    lines.push({
      tree_id: q.tree_id,
      tree_code: q.tree_code,
      tree_name: q.tree_name,
      unit: q.unit,
      quantity: q.quantity,
      breakdown_id: breakdown.id ?? null,
      labor_cost: laborCost,
      material_cost: materialCost,
      machinery_cost: machineryCost,
      direct_cost: laborCost + materialCost + machineryCost,
      note: null,
    });
  }

  const port = input.port ?? null;
  const shiftLabor = port?.shift_labor_surcharge ?? 0;
  const shiftMachinery = port?.shift_machinery_surcharge ?? 0;
  const laborSum = lines.reduce((a, l) => a + l.labor_cost, 0);
  const materialSum = lines.reduce((a, l) => a + l.material_cost, 0);
  const machinerySum = lines.reduce((a, l) => a + l.machinery_cost, 0);
  let directRaw = laborSum * (1 + shiftLabor) + materialSum + machinerySum * (1 + shiftMachinery);
  if (port) {
    const soilFactor = port.soil_factor ?? 1;
    const transportCoefficient = port.transport_coefficient ?? 1;
    directRaw = directRaw * soilFactor * transportCoefficient * (1 + port.soil_correction);
    if (port.night_surcharge) directRaw = directRaw + laborSum * port.night_surcharge;
    if (port.spoil_unit_price) {
      disposalCost = input.quantities.reduce((a, q) => a + q.quantity, 0) * port.spoil_unit_price;
      directRaw = directRaw + disposalCost;
    }
  }
  const directCost = applyRounding(directRaw, input.rounding.direct_cost);
  const commonTempCost = applyRounding(
    directCost * input.rates.common_temp,
    input.rounding.common_temp
  );
  const siteManagementCost = applyRounding(
    (directCost + commonTempCost) * input.rates.site_management,
    input.rounding.site_management
  );
  const generalManagementCost = applyRounding(
    (directCost + commonTempCost + siteManagementCost) * input.rates.general_management,
    input.rounding.general_management
  );
  const subtotal = applyRounding(
    directCost + commonTempCost + siteManagementCost + generalManagementCost,
    input.rounding.subtotal
  );
  const taxAmount = applyRounding(subtotal * taxRate, input.rounding.tax);
  const total = applyRounding(subtotal + taxAmount, input.rounding.total);

  const portExtras: PortExtras | null = port
    ? {
        operation_rate: port.operation_rate,
        work_days: portWorkDays,
        standby_days: portStandbyDays,
        mobilization_days: port.mobilization_days ?? 0,
        mobilization_cost: portMobilizationCost,
        soil_correction: port.soil_correction,
        night_surcharge: port.night_surcharge,
        soil_factor: port.soil_factor ?? 1,
        transport_coefficient: port.transport_coefficient ?? 1,
        soil_type_code: port.soil_type_code ?? null,
        spoil_ground_code: port.spoil_ground_code ?? null,
        transport_distance_km: port.transport_distance_km ?? null,
        disposal_cost: disposalCost,
        shift_labor_surcharge: shiftLabor,
        shift_machinery_surcharge: shiftMachinery,
        shift_rules: port.shift_rules ?? [],
      }
    : null;

  return {
    lines,
    materials,
    direct_cost: directCost,
    common_temp_cost: commonTempCost,
    site_management_cost: siteManagementCost,
    general_management_cost: generalManagementCost,
    subtotal,
    tax_amount: taxAmount,
    total,
    warnings,
    port_extras: portExtras,
  };
}
