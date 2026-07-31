// Civil Cost Index Dashboard - preview E2E smoke（Playwright + system Chromium）
// 使い方:
//   npm i -D playwright-core  （または一時ディレクトリにインストールして NODE_PATH 指定）
//   CCI_E2E_BASE=http://127.0.0.1:13000 node scripts/e2e-preview.mjs

import { chromium } from "playwright-core";

const BASE = process.env.CCI_E2E_BASE ?? "http://127.0.0.1:13000";
const EXECUTABLE = process.env.CCI_E2E_CHROMIUM ?? "/usr/bin/chromium-browser";

const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ["--no-sandbox"] });

const consoleErrors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

async function goto(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);
}

// 1. トップダッシュボード
await goto("/");
check("dashboard: 見出し", (await page.getByRole("heading", { name: "トップダッシュボード" }).count()) === 1);
check("dashboard: KPIカード（前月比）", (await page.getByText("前月比", { exact: false }).count()) >= 3);
check("dashboard: グラフ canvas", (await page.locator("canvas").count()) >= 1);
check("dashboard: 注目変動パネル", (await page.getByText("注目変動", { exact: false }).count()) >= 1);

// 2. 時系列分析
await goto("/timeseries");
check("timeseries: 見出し", (await page.getByRole("heading", { name: "時系列分析" }).count()) === 1);
check("timeseries: フィルター", (await page.getByLabel("データ分類").count()) === 1);
check("timeseries: グラフ canvas", (await page.locator("canvas").count()) >= 1);
try {
  await page.getByText("年月", { exact: false }).first().waitFor({ timeout: 10000 });
  check("timeseries: データテーブル", true);
} catch {
  check("timeseries: データテーブル", false, "テーブルヘッダーが表示されない");
}
check("timeseries: CSVボタン", (await page.getByRole("button", { name: "CSV出力" }).count()) >= 1);
check("timeseries: PNGボタン", (await page.getByRole("button", { name: "PNG出力" }).count()) >= 1);

// 3. 比較分析
await goto("/compare");
check("compare: 見出し", (await page.getByRole("heading", { name: "比較分析" }).count()) === 1);
check("compare: 系列追加ボタン", (await page.getByRole("button", { name: /系列追加/ }).count()) === 1);
check("compare: グラフ canvas", (await page.locator("canvas").count()) >= 1);

// 4. データテーブル
await goto("/table");
check("table: 見出し", (await page.getByRole("heading", { name: "データテーブル" }).count()) === 1);
check("table: 行データ", (await page.locator("tbody tr").count()) >= 1);

// 5. レポート出力
await goto("/export");
check("export: 見出し", (await page.getByRole("heading", { name: "レポート出力" }).count()) === 1);
check("export: CSVボタン", (await page.getByRole("button", { name: /CSV出力/ }).count()) >= 1);
check("export: PDF準備中表記", (await page.getByText("準備中", { exact: false }).count()) >= 1);

// 6. 管理: データソース
await goto("/admin/data-sources");
check("admin-ds: 見出し", (await page.getByRole("heading", { name: "データソース管理" }).count()) === 1);
check("admin-ds: 一覧", (await page.getByText("サンプル公開統計", { exact: false }).count()) >= 1);

// 7. 管理: 取込履歴
await goto("/admin/fetch-jobs");
check("admin-jobs: 見出し", (await page.getByRole("heading", { name: "データ取込履歴" }).count()) === 1);
check("admin-jobs: 履歴行", (await page.locator("tbody tr").count()) >= 1);

// 8. 設定
await goto("/settings");
check("settings: 見出し", (await page.getByRole("heading", { name: "ユーザー設定" }).count()) === 1);
check("settings: 保存ボタン", (await page.getByRole("button", { name: "保存" }).count()) === 1);

// 9. モバイル表示（375px）
const mobile = await browser.newPage({ viewport: { width: 375, height: 667 } });
await mobile.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30000 });
await mobile.waitForTimeout(1200);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("mobile: 横スクロールなし", !overflow, overflow ? `scrollWidth=${overflow}` : "");
check("mobile: トップ見出し", (await mobile.getByRole("heading", { name: "トップダッシュボード" }).count()) === 1);
await mobile.close();

// 10. アクセシビリティ基本確認
check("a11y: h1 存在", (await page.getByRole("heading", { level: 1 }).count()) >= 1);
check("a11y: フォーカス可能要素", (await page.locator("a,button,input,select").count()) >= 5);
check("console: エラーなし", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

await browser.close();

console.log(`\nE2E summary: ${results.length - failures}/${results.length} PASS`);
if (failures > 0) process.exit(1);
