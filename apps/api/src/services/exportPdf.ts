import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Sql } from "../lib/db";
import type { Env } from "../types";
import { computeRates, normalizeSeries } from "../lib/stats";
import { fetchRawRows, type TimeseriesParams } from "./timeseries";

const DEFAULT_FONT_URL =
  "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-jp/NotoSansJP_400Regular.ttf";

const fontCache = new Map<string, Uint8Array>();

export async function getCjkFontBytes(env: Pick<Env, "PDF_CJK_FONT_URL">): Promise<Uint8Array> {
  const url = env.PDF_CJK_FONT_URL?.trim() || DEFAULT_FONT_URL;
  const cached = fontCache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const err = new Error(`日本語フォントの取得に失敗しました（HTTP ${res.status}）。PDF_CJK_FONT_URL を設定してください。`);
    (err as Error & { status?: number }).status = 502;
    throw err;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  fontCache.set(url, bytes);
  return bytes;
}

function wrapText(font: { widthOfTextAtSize: (t: string, s: number) => number }, text: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    if (font.widthOfTextAtSize(current + ch, size) > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildPdfReport(input: {
  title: string;
  subtitle: string;
  disclaimer: string;
  sections: Array<{ heading: string; rows: string[][] }>;
  fontBytes?: Uint8Array;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = input.fontBytes
    ? await doc.embedFont(input.fontBytes, { subset: true })
    : await doc.embedFont(StandardFonts.Helvetica);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const gray = rgb(0.45, 0.5, 0.58);
  const dark = rgb(0.1, 0.14, 0.2);
  const accent = rgb(0.88, 0.54, 0.17);

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };
  const drawWrapped = (text: string, size: number, color = dark, lineGap = 4) => {
    const lines = wrapText(font, text, contentWidth, size);
    for (const line of lines) {
      ensureSpace(size + lineGap);
      page.drawText(line, { x: margin, y, size, font, color });
      y -= size + lineGap;
    }
  };

  page.drawText(input.title, { x: margin, y, size: 20, font, color: dark });
  y -= 30;
  page.drawText(input.subtitle, { x: margin, y, size: 11, font, color: gray });
  y -= 22;
  page.drawRectangle({ x: margin, y: y + 4, width: contentWidth, height: 2, color: accent });
  y -= 18;
  drawWrapped(input.disclaimer, 9, gray);
  y -= 12;
  drawWrapped(
    input.fontBytes
      ? `生成日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`
      : `Generated: ${new Date().toISOString()}`,
    9,
    gray
  );

  for (const section of input.sections) {
    ensureSpace(30);
    page.drawText(section.heading, { x: margin, y, size: 13, font, color: dark });
    y -= 18;
    for (const row of section.rows) {
      const line = row.join(" | ");
      const lines = wrapText(font, line, contentWidth, 8);
      ensureSpace(8 * lines.length + 6);
      for (const l of lines) {
        page.drawText(l, { x: margin, y, size: 8, font, color: dark });
        y -= 8;
      }
      y -= 2;
    }
    y -= 8;
  }

  const footer = input.fontBytes
    ? "表示値は参考情報です。積算・契約・経営判断の最終根拠は出典元の公表値をご確認ください。"
    : "Reference only. Please verify with original published sources.";
  page.drawText(
    footer,
    { x: margin, y: 28, size: 7, font, color: gray }
  );
  return Uint8Array.from(await doc.save());
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "確報",
  preliminary: "速報",
  revised: "改定",
  missing: "欠損",
};

export async function buildPdfExport(
  sql: Sql,
  p: TimeseriesParams,
  fontBytes?: Uint8Array
): Promise<Uint8Array> {
  const rows = await fetchRawRows(sql, p);
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.item_id}:${row.region_id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  const sections: Array<{ heading: string; rows: string[][] }> = [];
  for (const list of grouped.values()) {
    const first = list[0];
    const points = list.map((r) => ({ period: r.period_date, value: Number(r.value) }));
    const rates = computeRates(points);
    const normalized = normalizeSeries(points, p.basePeriod ?? null);
    const useNormalized = p.normalize && normalized.baseRaw != null;
    const sectionRows: string[][] = [["年月", "値", "前月比", "前年比", "状態"]];
    for (const row of list) {
      const raw = Number(row.value);
      const normValue = normalized.values.get(row.period_date);
      const rate = rates.get(row.period_date);
      sectionRows.push([
        row.period_date,
        (useNormalized ? (normValue ?? raw) : raw).toLocaleString("ja-JP", { maximumFractionDigits: 2 }),
        rate?.mom != null ? `${rate.mom.toFixed(1)}%` : "—",
        rate?.yoy != null ? `${rate.yoy.toFixed(1)}%` : "—",
        STATUS_LABELS[row.value_status] ?? row.value_status,
      ]);
    }
    sections.push({
      heading: `${first.item_name}｜${first.region_name}（出典: ${first.source_name} / ${first.data_kind}${first.estimate_usable ? "" : "・参考のみ"}）`,
      rows: sectionRows,
    });
  }
  return buildPdfReport({
    title: "建設コスト市況レポート",
    subtitle: `データ分類: ${p.dataType} ／ 期間: ${p.startPeriod ?? "全期間"}〜${p.endPeriod ?? "全期間"}${useNormalizedFlag(p) ? `（基準 ${p.basePeriod ?? ""}=100）` : ""}`,
    disclaimer: "Civil Cost Intelligence Dashboard（建設コスト・市況分析基盤）",
    sections,
    fontBytes,
  });
}

function useNormalizedFlag(p: TimeseriesParams): boolean {
  return p.normalize && !!p.basePeriod;
}
