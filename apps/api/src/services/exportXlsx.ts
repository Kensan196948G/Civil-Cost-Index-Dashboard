import * as XLSX from "xlsx";
import type { Sql } from "../lib/db";
import { computeRates, normalizeSeries } from "../lib/stats";
import { fetchRawRows, groupRawRowsBySeries, type TimeseriesParams } from "./timeseries";

export const DATA_KIND_LABELS: Record<string, string> = {
  actual_price: "実単価",
  official_index: "公的指数",
  trend_assessment: "動向評価値",
  internal_actual: "社内実績単価",
  adopted_price: "採用単価",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "確報",
  preliminary: "速報",
  revised: "改定",
  missing: "欠損",
};

export async function buildXlsxExport(sql: Sql, p: TimeseriesParams): Promise<ArrayBuffer> {
  const rows = await fetchRawRows(sql, p);
  const grouped = groupRawRowsBySeries(rows);

  const detailRows: (string | number | null)[][] = [];
  for (const list of grouped.values()) {
    const points = list.map((r) => ({ period: r.period_date, value: Number(r.value) }));
    const rates = computeRates(points);
    const normalized = normalizeSeries(points, p.basePeriod ?? null);
    const useNormalized = p.normalize && normalized.baseRaw != null;
    for (const row of list) {
      const raw = Number(row.value);
      const normValue = normalized.values.get(row.period_date);
      const rate = rates.get(row.period_date);
      detailRows.push([
        row.period_date,
        row.item_name,
        row.region_name,
        useNormalized ? (normValue ?? null) : raw,
        useNormalized ? "指数" : (row.unit ?? ""),
        DATA_KIND_LABELS[row.data_kind] ?? row.data_kind,
        row.estimate_usable ? "積算参考可" : "参考のみ",
        rate?.mom ?? null,
        rate?.yoy ?? null,
        STATUS_LABELS[row.value_status] ?? row.value_status,
        row.source_name,
        row.updated_at,
      ]);
    }
  }

  const sources = new Map<string, typeof rows[number]>();
  for (const row of rows) sources.set(row.source_name, row);

  const sourceRows: (string | null)[][] = [
    ["出典名", "URL", "データ種別", "積算利用", "ライセンス・利用条件", "再配布注記"],
  ];
  for (const row of sources.values()) {
    sourceRows.push([
      row.source_name,
      row.source_url,
      DATA_KIND_LABELS[row.data_kind] ?? row.data_kind,
      row.estimate_usable ? "積算参考可" : "参考のみ",
      row.license_note,
      row.redistribution_note,
    ]);
  }

  const summaryRows: (string | number | null)[][] = [
    ["項目", "内容"],
    ["システム名", "Civil Cost Intelligence Dashboard（建設コスト・市況分析基盤）"],
    ["出力目的", "積算前後の判断支援・市況確認・説明資料作成（正式な積算計算書ではありません）"],
    ["データ分類", p.dataType],
    ["対象期間", `${p.startPeriod ?? "全期間"}〜${p.endPeriod ?? "全期間"}`],
    ["指数化", p.normalize ? `基準 ${p.basePeriod ?? "指定なし"}=100` : "しない（実額表示）"],
    ["作成日時", new Date().toISOString()],
    ["注意", "表示値は参考情報です。積算・契約・経営判断の最終根拠は出典元の公表値をご確認ください。"],
    ["注意", "動向評価値（国土交通省 主要建設資材需給・価格動向調査）は1〜5段階のモニター評価であり、実単価・公的指数ではありません。"],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "概要");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["年月", "品目", "地域", "値", "単位", "データ種別", "積算利用", "前月比", "前年比", "状態", "出典", "取得日時"],
      ...detailRows,
    ]),
    "明細"
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sourceRows), "出典");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as ArrayBuffer;
}
