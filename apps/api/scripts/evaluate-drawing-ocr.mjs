#!/usr/bin/env node
// 図面OCR精度評価
// 前提: API稼働中・AI_PROVIDER=anthropic（Vision対応）
// 使い方:
//   ADMIN_API_KEY=... node scripts/evaluate-drawing-ocr.mjs \
//     --project-id <uuid> --base-id <uuid> [--api http://127.0.0.1:18000]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const projectId = getArg("--project-id");
const baseId = getArg("--base-id");
const api = getArg("--api") ?? "http://127.0.0.1:18000";
const adminKey = process.env.ADMIN_API_KEY;
if (!projectId || !baseId || !adminKey) {
  console.error("--project-id / --base-id / ADMIN_API_KEY が必要です");
  process.exit(1);
}
const dir = path.resolve(__dirname, "..", "..", "..", "data", "samples", "drawings");
const labels = readFileSync(path.join(dir, "labels.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((line) => {
  const [file, treeCode, quantity, unit] = line.split(",");
  return { file, tree_code: treeCode, quantity: Number(quantity), unit };
});

const status = await (await fetch(`${api}/api/ai/status`)).json();
if (status.data.provider !== "anthropic") {
  console.error(`図面OCRには Anthropic Vision が必要です（現在: ${status.data.provider}）。AI_PROVIDER=anthropic を設定してください。`);
  process.exit(2);
}

const results = [];
for (const label of labels) {
  const buf = readFileSync(path.join(dir, label.file));
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "image/png" }), label.file);
  form.append("project_id", projectId);
  form.append("base_id", baseId);
  const res = await fetch(`${api}/api/ai/drawing-extract`, {
    method: "POST",
    headers: { "X-Admin-Key": adminKey },
    body: form,
  });
  if (!res.ok) {
    console.error(`${label.file}: APIエラー（HTTP ${res.status}）`, await res.text());
    continue;
  }
  const data = (await res.json()).data;
  const candidates = data.result.candidates;
  const hit = candidates.find((c) => c.tree_code === label.tree_code);
  const qtyError = hit && hit.quantity ? Math.abs((hit.quantity - label.quantity) / label.quantity) * 100 : null;
  results.push({ file: label.file, expected: label.quantity, extracted: hit?.quantity ?? null, qtyError, matched: !!hit });
  console.log(`${label.file}: 期待 ${label.quantity}${label.unit} / 抽出 ${hit?.quantity ?? "なし"} / 誤差 ${qtyError != null ? qtyError.toFixed(1) + "%" : "—"}`);
}

const matchedCount = results.filter((r) => r.matched).length;
const matchRate = results.length ? (matchedCount / results.length) * 100 : 0;
const errors = results.filter((r) => r.qtyError != null).map((r) => r.qtyError).sort((a, b) => a - b);
const medianError = errors.length ? errors[Math.floor(errors.length / 2)] : null;
console.log(`\n細別一致率: ${matchRate.toFixed(1)}%（${matchedCount}/${results.length}）`);
console.log(`数量誤差中央値: ${medianError != null ? medianError.toFixed(1) + "%" : "—"}`);
const pass = matchRate >= 90 && medianError != null && medianError <= 5;
console.log(`判定: ${pass ? "PASS（一致率90%以上・誤差±5%以内）" : "要改善"}`);
process.exit(pass ? 0 : 1);
