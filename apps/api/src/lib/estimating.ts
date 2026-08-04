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
}): EstimateResult {
  const taxRate = input.taxRate ?? 0.1;
  const warnings: string[] = [];
  const lines: EstimateLineResult[] = [];
  const materials: EstimateMaterialResult[] = [];

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
        const amount = resourceAmount(q.quantity, res);
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

  const directRaw = lines.reduce((a, l) => a + l.direct_cost, 0);
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
  };
}
