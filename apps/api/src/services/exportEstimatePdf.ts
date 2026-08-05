import type { Sql } from "../lib/db";
import { getEstimate } from "./estimating";
import { buildPdfReport } from "./exportPdf";

export async function buildEstimatePdf(
  sql: Sql,
  estimateId: string,
  fontBytes?: Uint8Array
): Promise<Uint8Array> {
  const est = await getEstimate(sql, estimateId);
  if (!est) {
    const err = new Error("積算結果が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const summaryRows: string[][] = [
    ["直接工事費", est.direct_cost.toLocaleString("ja-JP")],
    ["共通仮設費", est.common_temp_cost.toLocaleString("ja-JP")],
    ["現場管理費", est.site_management_cost.toLocaleString("ja-JP")],
    ["一般管理費等", est.general_management_cost.toLocaleString("ja-JP")],
    ["小計（税抜）", est.subtotal.toLocaleString("ja-JP")],
    ["消費税（10%）", est.tax_amount.toLocaleString("ja-JP")],
    ["合計", est.total.toLocaleString("ja-JP")],
  ];
  const lineRows = est.lines.map((l) => [
    `${l.tree_code ?? ""} ${l.tree_name ?? ""}`,
    `${l.quantity} ${l.unit ?? ""}`,
    l.labor_cost.toLocaleString("ja-JP"),
    l.material_cost.toLocaleString("ja-JP"),
    l.machinery_cost.toLocaleString("ja-JP"),
    l.direct_cost.toLocaleString("ja-JP"),
  ]);
  const materialRows = est.materials
    .slice(0, 200)
    .map((m) => [
      m.resource_type,
      m.resource_name,
      `${m.quantity} ${m.unit ?? ""}`,
      m.unit_price.toLocaleString("ja-JP"),
      m.amount.toLocaleString("ja-JP"),
    ]);
  const sections = [
    {
      heading: "総括表",
      rows: summaryRows,
    },
    {
      heading: "内訳（工種別）",
      rows: lineRows,
    },
    {
      heading: "単価表（労務・材料・機械）",
      rows: materialRows,
    },
  ];
  if (est.port_options) {
    sections.push({
      heading: "港湾補足",
      rows: [
        ["稼働率", String(est.port_options.operation_rate)],
        ["回航日数", String(est.port_options.mobilization_days ?? "マスタ値")],
        ["土質補正係数", String(est.port_options.soil_factor ?? 1)],
        ["運搬距離係数", String(est.port_options.transport_coefficient ?? 1)],
        ["処分費", (est.port_extras?.disposal_cost ?? 0).toLocaleString("ja-JP")],
        ["労務補正", `+${((est.port_extras?.shift_labor_surcharge ?? 0) * 100).toFixed(0)}%`],
        ["機械補正", `+${((est.port_extras?.shift_machinery_surcharge ?? 0) * 100).toFixed(0)}%`],
        ["稼働日数", String(est.port_extras?.work_days ?? 0)],
        ["待機・拘束日数", String(est.port_extras?.standby_days ?? 0)],
        ["回航・えい航費", (est.port_extras?.mobilization_cost ?? 0).toLocaleString("ja-JP")],
      ],
    });
  }
  return buildPdfReport({
    title: `積算書（${est.base_code}）`,
    subtitle: `${est.project_name} ／ ${est.name} ／ 作成: ${est.created_by}`,
    disclaimer: `計算はコードで実行。AIは金額を確定しません。端数処理: ${JSON.stringify(est.rounding_rule_json)}`,
    sections,
    fontBytes,
  });
}
