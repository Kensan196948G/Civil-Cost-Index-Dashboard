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
    ],
    disclaimer: "参考情報。積算・契約の最終根拠は出典元の公表値と専門家確認。",
  });
}
