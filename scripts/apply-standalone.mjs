// standalone HTML を /standalone.html として提供する同期スクリプト
// 1) リポジトリルートの正本 → apps/web/public/standalone.html にコピー
// 2) ルート「/」は React WebUI（Next.js 静的エクスポート）をそのまま配信する
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "Civil Cost Index Dashboard (standalone).html");
const publicTarget = join(root, "apps", "web", "public", "standalone.html");

if (!existsSync(source)) {
  console.warn("[apply-standalone] 正本が見つかりません:", source);
} else {
  copyFileSync(source, publicTarget);
  console.log("[apply-standalone] copied ->", publicTarget);
}

const outDir = join(root, "apps", "web", "out");
if (process.env.NEXT_STATIC_EXPORT === "1" && existsSync(outDir)) {
  console.log("[apply-standalone] ルートは React WebUI を維持（standalone は /standalone.html のみ）");
}
