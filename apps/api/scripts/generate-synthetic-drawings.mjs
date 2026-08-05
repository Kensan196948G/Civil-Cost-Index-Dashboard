#!/usr/bin/env node
// 図面OCR評価用の合成図面PNGを生成する（依存ゼロ・ビットマップフォント）
// 使い方: node scripts/generate-synthetic-drawings.mjs [出力ディレクトリ] [件数]
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "..", "..", "data", "samples", "drawings");
const count = Number(process.argv[2] ?? 10);
mkdirSync(outDir, { recursive: true });

// ---- 3x5 ビットマップフォント（大文字・数字・記号） ----
const FONT = {
  "0": [1,1,1,1,0,1,1,0,1,1,0,1,1,1,1],
  "1": [0,1,0,1,1,0,0,1,0,0,1,0,1,1,1],
  "2": [1,1,1,0,0,1,0,1,0,1,0,0,1,1,1],
  "3": [1,1,1,0,0,1,1,1,1,0,0,1,1,1,1],
  "4": [1,0,1,1,0,1,1,1,1,0,0,1,0,0,1],
  "5": [1,1,1,1,0,0,1,1,1,0,0,1,1,1,1],
  "6": [1,1,1,1,0,0,1,1,1,1,0,1,1,1,1],
  "7": [1,1,1,0,0,1,0,1,0,0,1,0,0,1,0],
  "8": [1,1,1,1,0,1,1,1,1,1,0,1,1,1,1],
  "9": [1,1,1,1,0,1,1,1,1,0,0,1,1,1,1],
  A: [0,1,0,1,0,1,1,1,1,1,0,1,1,0,1],
  B: [1,1,0,1,0,1,1,1,0,1,0,1,1,1,0],
  C: [1,1,1,1,0,0,1,0,0,1,0,0,1,1,1],
  D: [1,1,0,1,0,1,1,0,1,1,0,1,1,1,0],
  E: [1,1,1,1,0,0,1,1,0,1,0,0,1,1,1],
  F: [1,1,1,1,0,0,1,1,0,1,0,0,1,0,0],
  G: [1,1,1,1,0,0,1,0,1,1,0,1,1,1,1],
  H: [1,0,1,1,0,1,1,1,1,1,0,1,1,0,1],
  I: [1,1,1,0,1,0,0,1,0,0,1,0,1,1,1],
  J: [0,0,1,0,0,1,0,0,1,1,0,1,1,1,0],
  K: [1,0,1,1,0,1,1,1,0,1,0,1,1,0,1],
  L: [1,0,0,1,0,0,1,0,0,1,0,0,1,1,1],
  M: [1,0,1,1,1,1,1,0,1,1,0,1,1,0,1],
  N: [1,0,1,1,1,1,1,0,1,1,0,1,1,0,1],
  O: [1,1,1,1,0,1,1,0,1,1,0,1,1,1,1],
  P: [1,1,1,1,0,1,1,1,1,1,0,0,1,0,0],
  Q: [1,1,1,1,0,1,1,0,1,1,1,1,0,1,1],
  R: [1,1,1,1,0,1,1,1,1,1,0,1,1,0,1],
  S: [1,1,1,1,0,0,1,1,1,0,0,1,1,1,1],
  T: [1,1,1,0,1,0,0,1,0,0,1,0,0,1,0],
  U: [1,0,1,1,0,1,1,0,1,1,0,1,1,1,1],
  V: [1,0,1,1,0,1,1,0,1,1,0,1,0,1,0],
  W: [1,0,1,1,0,1,1,0,1,1,1,1,1,0,1],
  X: [1,0,1,1,0,1,0,1,0,1,0,1,1,0,1],
  Y: [1,0,1,1,0,1,0,1,0,0,1,0,0,1,0],
  Z: [1,1,1,0,0,1,0,1,0,1,0,0,1,1,1],
  " ": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  "=": [0,0,0,1,1,1,0,0,0,1,1,1,0,0,0],
  ".": [0,0,0,0,0,0,0,0,0,0,0,0,0,1,0],
  "-": [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0],
  ":": [0,1,0,0,0,0,0,1,0,0,0,0,0,1,0],
  "/": [0,0,1,0,1,0,0,1,0,1,0,0,1,0,0],
  "%": [1,0,1,0,0,1,0,1,0,1,0,0,1,0,1],
};

// ---- PNGエンコーダ ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
      raw[o++] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 描画 ----
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvas(w, h) {
  return { w, h, data: new Uint8Array(w * h * 4).fill(255) };
}
function setPx(c, x, y, color) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  c.data[i] = color[0];
  c.data[i + 1] = color[1];
  c.data[i + 2] = color[2];
  c.data[i + 3] = 255;
}
function fillRect(c, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPx(c, xx, yy, color);
}
function drawLine(c, x0, y0, x1, y1, color, thickness = 2) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    fillRect(c, x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
  }
}
function drawText(c, x, y, text, scale, color) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row * 3 + col]) fillRect(c, cx + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cx += 4 * scale;
  }
}
function drawArrow(c, x0, y0, x1, y1, color) {
  drawLine(c, x0, y0, x1, y1, color);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const size = 7;
  drawLine(c, x1, y1, Math.round(x1 - ux * size + px * size), Math.round(y1 - uy * size + py * size), color);
  drawLine(c, x1, y1, Math.round(x1 - ux * size - px * size), Math.round(y1 - uy * size - py * size), color);
}

// ---- サンプル生成 ----
const labels = [["file", "expected_tree_code", "expected_quantity", "unit", "width_m", "depth_m", "height_m"]];
for (let i = 0; i < count; i++) {
  const rnd = mulberry32(1000 + i * 7);
  const width = Math.round((8 + rnd() * 12) * 10) / 10; // 8〜20m
  const depth = Math.round((8 + rnd() * 12) * 10) / 10; // 8〜20m
  const height = Math.round((1.5 + rnd() * 2.5) * 10) / 10; // 1.5〜4m
  const volume = Math.round(width * depth * height * 10) / 10;
  const c = createCanvas(800, 600);
  const black = [20, 24, 32];
  const blue = [30, 90, 172];
  // 掘削範囲（平面）
  const rx = 180;
  const ry = 200;
  const rw = 420;
  const rh = 280;
  fillRect(c, rx, ry, rw, rh, [230, 238, 250]);
  drawLine(c, rx, ry, rx + rw, ry, black, 3);
  drawLine(c, rx, ry + rh, rx + rw, ry + rh, black, 3);
  drawLine(c, rx, ry, rx, ry + rh, black, 3);
  drawLine(c, rx + rw, ry, rx + rw, ry + rh, black, 3);
  // 寸法線（上・左）
  drawArrow(c, rx, 160, rx + rw, 160, blue);
  drawText(c, rx + 120, 120, `W=${width.toFixed(1)}M`, 3, blue);
  drawArrow(c, 120, ry, 120, ry + rh, blue);
  drawText(c, 40, ry + 120, `D=${depth.toFixed(1)}M`, 3, blue);
  // 断面情報
  drawText(c, 240, 60, "EXCAVATION PLAN", 3, black);
  drawText(c, 250, 440, `H=${height.toFixed(1)}M`, 3, black);
  drawText(c, 200, 480, `VOL=${volume.toFixed(1)}M3`, 4, [180, 40, 40]);
  drawText(c, 170, 530, "SOIL EXCAVATION", 2, black);
  const fileName = `drawing_${String(i + 1).padStart(3, "0")}.png`;
  writeFileSync(path.join(outDir, fileName), encodePng(c.w, c.h, c.data));
  labels.push([fileName, "SOIL_EXCAVATION", String(volume), "m3", String(width), String(depth), String(height)]);
}
writeFileSync(path.join(outDir, "labels.csv"), labels.map((r) => r.join(",")).join("\n") + "\n", "utf8");
console.log(`生成: ${outDir}（${count}件・正解ラベル付き）`);
