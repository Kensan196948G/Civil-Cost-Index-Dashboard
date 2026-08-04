import type { Sql } from "../lib/db";
import { computeRates, normalizeSeries } from "../lib/stats";
import { fetchRawRows, type TimeseriesParams } from "./timeseries";

// ---- 最小 ZIP（Stored / 無圧縮）ライター ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = dosDateTime();
  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true); // stored
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, f.data.length, true);
    dv.setUint32(22, f.data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, f.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(centralHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, time, true);
    cdv.setUint16(14, date, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, f.data.length, true);
    cdv.setUint32(24, f.data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);
    offset += local.length + f.data.length;
  }
  const centralStart = offset;
  const centralSize = central.reduce((a, b) => a + b.length, 0);
  for (const c of central) chunks.push(c);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true);
  chunks.push(eocd);
  const total = chunks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// ---- PPTX ビルダー ----

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function textShape(id: number, name: string, x: number, y: number, w: number, h: number, paragraphs: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function para(text: string, sz = 1200, bold = false): string {
  return `<a:p><a:r><a:rPr lang="ja-JP" sz="${sz}"${bold ? ' b="1"' : ""}/><a:t>${esc(text)}</a:t></a:r></a:p>`;
}

function slideXml(title: string, subtitle: string, lines: string[]): string {
  const body = lines
    .slice(0, 24)
    .map((l) => `<a:p><a:r><a:rPr lang="ja-JP" sz="1100"/><a:t>${esc(l)}</a:t></a:r></a:p>`)
    .join("");
  const titleShape = textShape(2, "Title", 457200, 365760, 8382000, 731520, para(title, 2800, true));
  const subShape = textShape(3, "Subtitle", 457200, 1135380, 8382000, 426720, para(subtitle, 1400));
  const bodyShape = textShape(4, "Body", 457200, 1700000, 8382000, 4900000, body);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${titleShape}${subShape}${bodyShape}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:sldMaster>`;

const LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CCI"><a:themeElements><a:clrScheme name="CCI"><a:dk1><a:srgbClr val="1A2433"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="2E5AAC"/></a:dk2><a:lt2><a:srgbClr val="F2F4F8"/></a:lt2><a:accent1><a:srgbClr val="E08A2B"/></a:accent1><a:accent2><a:srgbClr val="2E9E6B"/></a:accent2><a:accent3><a:srgbClr val="C5392F"/></a:accent3><a:accent4><a:srgbClr val="6B45B0"/></a:accent4><a:accent5><a:srgbClr val="1F8255"/></a:accent5><a:accent6><a:srgbClr val="B5701A"/></a:accent6><a:hlink><a:srgbClr val="2E5AAC"/></a:hlink><a:folHlink><a:srgbClr val="6B45B0"/></a:folHlink></a:clrScheme><a:fontScheme name="CCI"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Yu Gothic"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Yu Gothic"/></a:minorFont></a:fontScheme><a:fmtScheme name="CCI"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

export function buildPptx(input: {
  title: string;
  subtitle: string;
  slides: Array<{ title: string; subtitle: string; lines: string[] }>;
  disclaimer: string;
}): Uint8Array {
  const slides = [
    {
      title: input.title,
      subtitle: input.subtitle,
      lines: [input.disclaimer, `生成日時: ${new Date().toISOString()}`, "", "表示値は参考情報です。積算・契約・経営判断の最終根拠は出典元の公表値をご確認ください。"],
    },
    ...input.slides,
  ];
  const enc = new TextEncoder();
  const files: Array<{ name: string; data: Uint8Array }> = [];
  const contentTypeOverrides = slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${contentTypeOverrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  files.push({ name: "[Content_Types].xml", data: enc.encode(contentTypes) });
  files.push({
    name: "_rels/.rels",
    data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
  });
  files.push({
    name: "docProps/core.xml",
    data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(input.title)}</dc:title><dc:creator>CCI Dashboard</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`),
  });
  files.push({
    name: "docProps/app.xml",
    data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CCI Dashboard</Application><Slides>${slides.length}</Slides></Properties>`),
  });
  const slideIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("");
  const slideRels = slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("");
  files.push({
    name: "ppt/presentation.xml",
    data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`),
  });
  files.push({
    name: "ppt/_rels/presentation.xml.rels",
    data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRels}</Relationships>`),
  });
  files.push({ name: "ppt/slideMasters/slideMaster1.xml", data: enc.encode(MASTER_XML) });
  files.push({
    name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`),
  });
  files.push({ name: "ppt/slideLayouts/slideLayout1.xml", data: enc.encode(LAYOUT_XML) });
  files.push({
    name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`),
  });
  files.push({ name: "ppt/theme/theme1.xml", data: enc.encode(THEME_XML) });
  slides.forEach((s, i) => {
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: enc.encode(slideXml(s.title, s.subtitle, s.lines)) });
    files.push({
      name: `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`),
    });
  });
  return zipStore(files);
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "確報",
  preliminary: "速報",
  revised: "改定",
  missing: "欠損",
};

export async function buildPptxExport(sql: Sql, p: TimeseriesParams): Promise<Uint8Array> {
  const rows = await fetchRawRows(sql, p);
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.item_id}:${row.region_id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  const slides: Array<{ title: string; subtitle: string; lines: string[] }> = [];
  for (const list of grouped.values()) {
    const first = list[0];
    const points = list.map((r) => ({ period: r.period_date, value: Number(r.value) }));
    const rates = computeRates(points);
    const normalized = normalizeSeries(points, p.basePeriod ?? null);
    const useNormalized = p.normalize && normalized.baseRaw != null;
    const lines = [
      `出典: ${first.source_name}`,
      `データ種別: ${first.data_kind} / 積算利用: ${first.estimate_usable ? "積算参考可" : "参考のみ"}`,
      "",
      "年月 | 値 | 前月比 | 前年比 | 状態",
    ];
    for (const row of list) {
      const raw = Number(row.value);
      const normValue = normalized.values.get(row.period_date);
      const rate = rates.get(row.period_date);
      lines.push(
        `${row.period_date} | ${(useNormalized ? (normValue ?? raw) : raw).toLocaleString("ja-JP", { maximumFractionDigits: 2 })} | ${rate?.mom != null ? `${rate.mom.toFixed(1)}%` : "—"} | ${rate?.yoy != null ? `${rate.yoy.toFixed(1)}%` : "—"} | ${STATUS_LABELS[row.value_status] ?? row.value_status}`
      );
    }
    slides.push({
      title: `${first.item_name}｜${first.region_name}`,
      subtitle: `${p.startPeriod ?? "全期間"}〜${p.endPeriod ?? "全期間"}${useNormalized ? `（基準 ${p.basePeriod ?? ""}=100）` : ""}`,
      lines,
    });
  }
  return buildPptx({
    title: "建設コスト市況レポート",
    subtitle: `データ分類: ${p.dataType} ／ 生成: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    slides,
    disclaimer: "Civil Cost Intelligence Dashboard（建設コスト・市況分析基盤）",
  });
}
