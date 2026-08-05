#!/usr/bin/env node
// AI数量取込の精度評価
// 使い方:
//   ADMIN_API_KEY=... node scripts/evaluate-ai-extraction.mjs \
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

const samplePath = path.resolve(__dirname, "..", "data", "samples", "quantity_sheet_sample.csv");
const csv = readFileSync(samplePath, "utf8");
const [headerLine, ...bodyLines] = csv.trim().split(/\r?\n/);
const header = headerLine.split(",");
const expectedByRow = new Map(
  bodyLines.map((line, i) => {
    const cols = line.split(",");
    const row = Object.fromEntries(header.map((h, j) => [h, cols[j]]));
    return [i + 2, String(row.expected_tree_code ?? "")];
  })
);

const form = new FormData();
form.append("file", new Blob([csv], { type: "text/csv" }), "quantity_sheet_sample.csv");
form.append("project_id", projectId);
form.append("base_id", baseId);
const res = await fetch(`${api}/api/quantities/ai-extract`, {
  method: "POST",
  headers: { "X-Admin-Key": adminKey },
  body: form,
});
if (!res.ok) {
  console.error(`AI抽出APIエラー（HTTP ${res.status}）`, await res.text());
  process.exit(1);
}
const data = (await res.json()).data;
const candidates = data.result.candidates;

let exact = 0;
let totalMatched = 0;
const errors = [];
for (const c of candidates) {
  const expected = expectedByRow.get(c.row_number) ?? "";
  if (!expected) continue;
  totalMatched++;
  if (c.tree_code === expected) {
    exact++;
  } else {
    errors.push(`行${c.row_number}: 期待 ${expected} / 抽出 ${c.tree_code ?? "（なし）"}（${c.match_method}）`);
  }
}
const matchRate = totalMatched ? (exact / totalMatched) * 100 : 0;
console.log(`AI抽出: ${data.result.provider}${data.result.model ? ` / ${data.result.model}` : ""}`);
console.log(`候補: ${candidates.length}行 / 正解あり: ${totalMatched}行`);
console.log(`細別一致率: ${matchRate.toFixed(1)}%（${exact}/${totalMatched}）`);
if (errors.length) {
  console.log("不一致:");
  errors.forEach((e) => console.log("  " + e));
}
console.log(`判定: ${matchRate >= 90 ? "PASS（90%以上）" : "要改善（90%未満）"}`);
process.exit(matchRate >= 90 ? 0 : 1);
