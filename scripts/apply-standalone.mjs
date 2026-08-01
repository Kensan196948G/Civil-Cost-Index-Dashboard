// standalone HTML を WebUI ルートへ適用する同期スクリプト
// 1) リポジトリルートの正本 → apps/web/public/standalone.html にコピー
// 2) 静的エクスポート時は out/index.html を standalone へのリダイレクトに差し替え
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  mkdirSync(join(outDir, "standalone"), { recursive: true });
  copyFileSync(publicTarget, join(outDir, "standalone", "index.html"));
  writeFileSync(
    join(outDir, "index.html"),
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/standalone/">' +
      '<title>Civil Cost Index Dashboard</title></head><body><a href="/standalone/">Civil Cost Index Dashboard</a></body></html>'
  );
  console.log("[apply-standalone] static export root -> /standalone/");
}
