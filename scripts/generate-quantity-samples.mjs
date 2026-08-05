#!/usr/bin/env node
// 数量計算書のAI取込評価用サンプルを生成する
// 使い方: node scripts/generate-quantity-samples.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, "..", "data", "samples", "quantity_sheet_sample.csv");

const rows = [
  { expected_tree_code: "SOIL_EXCAVATION", item_name: "掘削工", quantity: 1000, unit: "m3", condition_json: '{"soil":"clay"}' },
  { expected_tree_code: "SOIL_EXCAVATION", item_name: "掘削（土砂）", quantity: 500, unit: "m3", condition_json: '{"soil":"sand"}' },
  { expected_tree_code: "CONCRETE_PLACING", item_name: "コンクリート打設", quantity: 120, unit: "m3", condition_json: "{}" },
  { expected_tree_code: "CONCRETE_PLACING", item_name: "コンクリート打設 18-8-25", quantity: 80, unit: "m3", condition_json: '{"spec":"18-8-25"}' },
  { expected_tree_code: "PAVEMENT_ASPHALT", item_name: "アスファルト舗装", quantity: 2000, unit: "m2", condition_json: "{}" },
  { expected_tree_code: "PAVEMENT_ASPHALT", item_name: "アスファルト舗装（切削オーバーレイ）", quantity: 1500, unit: "m2", condition_json: '{"method":"overlay"}' },
  { expected_tree_code: "SOIL_EXCAVATION", item_name: "床掘り", quantity: 300, unit: "m3", condition_json: "{}" },
  { expected_tree_code: "CONCRETE_PLACING", item_name: "コンクリート", quantity: 60, unit: "m3", condition_json: "{}" },
  { expected_tree_code: "PAVEMENT_ASPHALT", item_name: "舗装工", quantity: 900, unit: "m2", condition_json: "{}" },
  { expected_tree_code: "SOIL_EXCAVATION", item_name: "掘削", quantity: 250, unit: "m3", condition_json: "{}" },
];

const header = "tree_code,item_name,quantity,unit,condition_json,expected_tree_code";
const lines = rows.map((r, i) =>
  [i + 1, r.item_name, r.quantity, r.unit, r.condition_json, r.expected_tree_code].join(",")
);
writeFileSync(out, [header, ...lines].join("\n") + "\n", "utf8");
console.log(`生成: ${out}（${rows.length}行・正解ラベル付き）`);
