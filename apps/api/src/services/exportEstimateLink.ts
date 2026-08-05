import * as XLSX from "xlsx";
import type { Sql } from "../lib/db";
import { DATA_KIND_LABELS } from "./exportXlsx";
import { getSnapshot } from "./priceVersions";

export async function buildEstimateLinkXlsx(
  sql: Sql,
  opts: { snapshot_id?: string | null } = {}
): Promise<ArrayBuffer> {
  const versions = await sql`
    SELECT pv.id, pv.data_source_id, pv.item_id, i.item_code, i.item_name,
           pv.region_id, r.region_name, pv.version_label, pv.value, pv.unit,
           pv.publication_date, pv.effective_start, pv.effective_end, pv.revised_at,
           pv.retroactive, pv.delivery_terms, pv.tax_inclusive, pv.freight_included,
           pv.note, pv.status, pv.approved_at,
           ds.source_name, ds.source_url, ds.license_note, ds.redistribution_note,
           ds.data_kind, ds.estimate_usable
    FROM price_versions pv
    JOIN items i ON i.id = pv.item_id
    LEFT JOIN regions r ON r.id = pv.region_id
    JOIN data_sources ds ON ds.id = pv.data_source_id
    WHERE pv.status = 'approved'
    ORDER BY i.item_code, r.region_code NULLS FIRST, pv.effective_start DESC
  `;

  const candidates: (string | number | null)[][] = [
    [
      "品目コード", "品目名", "地域", "単位", "単価", "データ種別", "積算利用",
      "適用開始", "適用終了", "公表日", "改定日", "税込/税抜", "運賃", "荷渡し条件",
      "出典", "出典URL", "ライセンス", "再配布注記", "単価版ID",
    ],
  ];
  for (const v of versions) {
    candidates.push([
      v.item_code, v.item_name, v.region_name ?? "全国", v.unit, Number(v.value),
      DATA_KIND_LABELS[v.data_kind] ?? v.data_kind,
      v.estimate_usable ? "積算参考可" : "参考のみ",
      v.effective_start, v.effective_end, v.publication_date, v.revised_at,
      v.tax_inclusive ? "税込" : "税抜", v.freight_included ? "運賃込み" : "運賃別",
      v.delivery_terms, v.source_name, v.source_url, v.license_note,
      v.redistribution_note, v.id,
    ]);
  }

  const diffRows: (string | number | null)[][] = [
    ["品目コード", "品目名", "地域", "旧単価", "新単価", "差額", "変動率(%)", "旧適用開始", "新適用開始", "新単価版ID"],
  ];
  const grouped = new Map<string, typeof versions>();
  for (const v of versions) {
    const key = `${v.item_code}|${v.region_id ?? ""}`;
    const list = grouped.get(key) ?? [];
    list.push(v);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) {
    // effective_start 降順で並んでいるため、直近とその次を比較
    if (list.length < 2) continue;
    const newest = list[0];
    const previous = list[1];
    const oldVal = Number(previous.value);
    const newVal = Number(newest.value);
    diffRows.push([
      newest.item_code, newest.item_name, newest.region_name ?? "全国",
      oldVal, newVal, newVal - oldVal,
      oldVal !== 0 ? ((newVal - oldVal) / oldVal) * 100 : null,
      previous.effective_start, newest.effective_start, newest.id,
    ]);
  }

  const snapshotRows: (string | number | null)[][] = [
    ["品目コード", "品目名", "地域", "単位", "単価", "出典", "適用開始", "適用終了"],
  ];
  let snapshotMeta: (string | number | null)[][] = [];
  if (opts.snapshot_id) {
    const snap = await getSnapshot(sql, opts.snapshot_id);
    if (snap) {
      snapshotMeta = [
        ["項目", "内容"],
        ["スナップショット", snap.name],
        ["基準日", snap.snapshot_date],
        ["作成者", snap.created_by],
      ];
      for (const it of snap.items) {
        snapshotRows.push([
          it.item_code, it.item_name, it.region_name ?? "全国", it.unit,
          it.value, it.data_source_name, it.effective_start, it.effective_end,
        ]);
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(candidates), "単価候補");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(diffRows), "改定差分");
  if (snapshotMeta.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(snapshotMeta), "スナップショット");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(snapshotRows), "スナップショット明細");
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["注意", "本シートは積算システム・Excelへの「単価候補・根拠・改定差分」受け渡し用です。正式な積算計算書ではありません。"],
      ["注意", "採用する単価は積算責任者が決定し、採用単価として別途管理してください。"],
    ]),
    "注意事項"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as ArrayBuffer;
}
