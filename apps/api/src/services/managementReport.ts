import type { Sql } from "../lib/db";
import { getDashboardSummary } from "./dashboard";
import { listProjects } from "./projects";
import { listEstimates } from "./estimating";
import { listQuotations } from "./quotations";
import { buildPdfReport } from "./exportPdf";
import { buildPptx } from "./exportPptx";

export async function buildManagementReportData(sql: Sql) {
  const [summary, projects, estimates, quotations] = await Promise.all([
    getDashboardSummary(sql, { period: "1y" }),
    listProjects(sql),
    listEstimates(sql),
    listQuotations(sql),
  ]);
  const totalEstimate = estimates.reduce((a, e) => a + e.total, 0);
  const projectProfit = projects
    .map((p) => {
      const latest = estimates
        .filter((e) => e.project_id === p.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!latest) return null;
      const margin = latest.total !== 0 ? ((latest.total - p.base_total) / latest.total) * 100 : null;
      return {
        project_name: p.name,
        base_total: p.base_total,
        estimate_total: latest.total,
        margin_rate: margin,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const seaRows = await sql`
    SELECT workable_days, calendar_days FROM port_sea_conditions
  `;
  const portAvailability =
    seaRows.length > 0
      ? seaRows.reduce((a, r) => a + Number(r.workable_days) / (Number(r.calendar_days) || 30), 0) / seaRows.length
      : null;
  const portEstimateCount = estimates.filter((e) => e.base_code?.startsWith("PORT")).length;
  const adoptedRows = await sql`
    SELECT qi.item_id, qi.item_name, qi.unit_price, qi.unit
    FROM quotation_items qi
    WHERE qi.is_adopted = true AND qi.item_id IS NOT NULL
  `;
  const adoptedVsActual = [];
  for (const a of adoptedRows) {
    const rec = await sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price) AS median
      FROM construction_records WHERE item_id = ${a.item_id}
    `;
    const median = rec[0]?.median;
    adoptedVsActual.push({
      item_name: a.item_name,
      adopted_unit_price: Number(a.unit_price),
      actual_median: median != null ? Number(median) : null,
      ratio: median != null && Number(median) !== 0 ? Number(a.unit_price) / Number(median) : null,
    });
  }
  return {
    latest_period: summary.latest_period,
    last_updated_at: summary.last_updated_at,
    kpis: summary.kpis,
    alerts_count: summary.alerts.length,
    project_count: projects.length,
    project_base_total: projects.reduce((a, p) => a + p.base_total, 0),
    estimate_count: estimates.length,
    estimate_total: totalEstimate,
    quotation_count: quotations.length,
    project_profit: projectProfit,
    project_profit_avg:
      projectProfit.length > 0
        ? projectProfit.reduce((a, p) => a + (p.margin_rate ?? 0), 0) / projectProfit.length
        : null,
    port_availability: portAvailability,
    port_estimate_count: portEstimateCount,
    adopted_vs_actual: adoptedVsActual,
  };
}

export async function buildManagementPdf(
  sql: Sql,
  fontBytes?: Uint8Array
): Promise<Uint8Array> {
  const d = await buildManagementReportData(sql);
  const kpiRows = d.kpis.map((k) => [k.name, String(k.value), String(k.period)]);
  return buildPdfReport({
    title: "経営会議向け 建設コスト総括レポート",
    subtitle: `対象: ${d.latest_period ?? "—"} ／ 生成: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    disclaimer: "本レポートは参考情報です。積算・契約・経営判断の最終根拠は出典元の公表値と専門家の確認を経てください。",
    sections: [
      { heading: "市況（KPI）", rows: [["指標", "値", "対象年月"], ...kpiRows, ["注目変動", String(d.alerts_count), ""]] },
      { heading: "案件・積算", rows: [["案件数", String(d.project_count), ""], ["案件ベース額合計", String(Math.round(d.project_base_total)), "円"], ["積算結果数", String(d.estimate_count), ""], ["積算合計", String(Math.round(d.estimate_total)), "円"]] },
      { heading: "見積・査定", rows: [["見積件数", String(d.quotation_count), ""]] },
      {
        heading: "KPI拡張（粗利・港湾稼働率・実績対比）",
        rows: [
          ["案件別粗利率（平均）", d.project_profit_avg != null ? `${d.project_profit_avg.toFixed(1)}%` : "—", ""],
          ["港湾稼働率（平均）", d.port_availability != null ? `${(d.port_availability * 100).toFixed(1)}%` : "—", ""],
          ["港湾積算件数", String(d.port_estimate_count), ""],
          ...d.adopted_vs_actual.map((a) => [
            `採用単価 vs 実績（${a.item_name}）`,
            a.ratio != null ? `${(a.ratio * 100).toFixed(1)}%` : "—",
            "",
          ]),
        ],
      },
    ],
    fontBytes,
  });
}

export async function buildManagementPptx(sql: Sql): Promise<Uint8Array> {
  const d = await buildManagementReportData(sql);
  return buildPptx({
    title: "経営会議向け 建設コスト総括",
    subtitle: `対象: ${d.latest_period ?? "—"} ／ ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    slides: [
      {
        title: "市況",
        subtitle: "主要指標",
        lines: d.kpis.map((k) => `${k.name}: ${k.value}（${k.period}）`).concat([`注目変動: ${d.alerts_count}件`]),
      },
      {
        title: "案件・積算・見積",
        subtitle: "全体像",
        lines: [
          `案件数: ${d.project_count}件（ベース額合計 ${Math.round(d.project_base_total).toLocaleString("ja-JP")}円）`,
          `積算結果: ${d.estimate_count}件（合計 ${Math.round(d.estimate_total).toLocaleString("ja-JP")}円）`,
          `見積件数: ${d.quotation_count}件`,
        ],
      },
      {
        title: "KPI拡張",
        subtitle: "粗利・港湾稼働率・実績対比",
        lines: [
          `案件別粗利率（平均）: ${d.project_profit_avg != null ? `${d.project_profit_avg.toFixed(1)}%` : "—"}`,
          `港湾稼働率（平均）: ${d.port_availability != null ? `${(d.port_availability * 100).toFixed(1)}%` : "—"}（積算 ${d.port_estimate_count}件）`,
          ...d.adopted_vs_actual.map((a) => `${a.item_name}: 採用 ${a.adopted_unit_price} / 実績中央値 ${a.actual_median ?? "—"}（${a.ratio != null ? `${(a.ratio * 100).toFixed(1)}%` : "—"}）`),
        ],
      },
    ],
    disclaimer: "参考情報。積算・契約の最終根拠は出典元の公表値と専門家確認。",
  });
}
