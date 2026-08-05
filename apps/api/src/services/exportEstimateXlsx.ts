import * as XLSX from "xlsx";
import type { Sql } from "../lib/db";
import { getEstimate } from "./estimating";

export async function buildEstimateXlsx(sql: Sql, estimateId: string): Promise<ArrayBuffer> {
  const est = await getEstimate(sql, estimateId);
  if (!est) return new ArrayBuffer(0);

  const summary: (string | number)[][] = [
    ["項目", "金額（円）"],
    ["直接工事費", est.direct_cost],
    ["共通仮設費", est.common_temp_cost],
    ["現場管理費", est.site_management_cost],
    ["一般管理費等", est.general_management_cost],
    ["小計", est.subtotal],
    ["消費税（10%）", est.tax_amount],
    ["合計", est.total],
    ["", ""],
    ["積算基準", `${est.base_code} ${est.base_name}`],
    ["案件", est.project_name],
    ["作成者", est.created_by],
    ["端数処理", JSON.stringify(est.rounding_rule_json)],
  ];
  const lines: (string | number | null)[][] = [
    ["工種コード", "工種名", "単位", "数量", "労務費", "材料費", "機械費", "直接費", "備考"],
  ];
  for (const l of est.lines) {
    lines.push([
      l.tree_code,
      l.tree_name,
      l.unit ?? "",
      l.quantity,
      l.labor_cost,
      l.material_cost,
      l.machinery_cost,
      l.direct_cost,
      l.note ?? "",
    ]);
  }
  const materials: (string | number)[][] = [
    ["内訳行", "区分", "資源名", "単位", "数量", "単価", "金額"],
  ];
  const lineByIndex = new Map<string, string>();
  est.lines.forEach((l, i) => lineByIndex.set(String(l.id), `${i + 1}: ${l.tree_name}`));
  for (const m of est.materials) {
    materials.push([
      lineByIndex.get(String(m.line_id)) ?? m.line_id ?? "",
      m.resource_type,
      m.resource_name,
      m.unit ?? "",
      m.quantity,
      m.unit_price,
      m.amount,
    ]);
  }
  const warnings = est.warnings ?? [];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "総括表");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lines), "内訳");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(materials), "単価表");
  if (est.port_options) {
    const portRows: (string | number)[][] = [
      ["項目", "値"],
      ["稼働率（海上施工可能日数考慮）", est.port_options.operation_rate],
      ["回航・えい航日数", est.port_options.mobilization_days ?? "マスタ値"],
      ["土質補正係数", est.port_options.soil_correction],
      ["夜間・交代制補正率", est.port_options.night_surcharge],
      ["", ""],
      ["稼働日数合計", est.port_extras?.work_days ?? 0],
      ["待機・拘束日数合計", est.port_extras?.standby_days ?? 0],
      ["回航・えい航費", est.port_extras?.mobilization_cost ?? 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(portRows), "港湾補足");
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["注意", "本シートは計算エンジン（コード）による積算結果です。AIは金額を確定しません。"], ...(warnings.length ? [["警告", warnings.join("\n")]] : [])]),
    "注意事項"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as ArrayBuffer;
}
