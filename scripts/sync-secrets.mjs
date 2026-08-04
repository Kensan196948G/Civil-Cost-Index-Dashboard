#!/usr/bin/env node
// CCI シークレット同期スクリプト
// ローカルファイル（apps/api/.secrets.env または .dev.vars）にキーを置くだけで、
// Cloudflare Worker の Secret / 本機LANの /etc/cci/cci.env へ反映し、デプロイと確認まで行う。
//
// 使い方:
//   node scripts/sync-secrets.mjs --cloudflare [--dry-run]
//   node scripts/sync-secrets.mjs --local      [--dry-run]
//   node scripts/sync-secrets.mjs --all        [--dry-run]
//   CCI_SECRETS_FILE=/path/to/file node scripts/sync-secrets.mjs --cloudflare
//   CCI_ENV_FILE=/etc/cci/cci.env node scripts/sync-secrets.mjs --local

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "apps", "api");
const wranglerBin = path.join(apiDir, "node_modules", ".bin", "wrangler");
const workerName = "cci-api-production";
const apiStatusUrl = `https://${workerName}.kensan1969.workers.dev/api/ai/status`;
const localStatusUrl = "http://127.0.0.1:18000/api/ai/status";

// .dev.vars から読み込む場合に Secret へ設定しないビルド時変数
const NON_SECRET_KEYS = new Set([
  "APP_ENV",
  "APP_VERSION",
  "API_HOST",
  "API_PORT",
  "PORT",
  "HOSTNAME",
  "CORS_ORIGINS",
  "NEXT_PUBLIC_API_BASE_URL",
  "API_PROXY_TARGET",
]);

function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

function findSecretsFile() {
  if (process.env.CCI_SECRETS_FILE) {
    if (!existsSync(process.env.CCI_SECRETS_FILE)) {
      console.error(`指定されたシークレットファイルがありません: ${process.env.CCI_SECRETS_FILE}`);
      process.exit(1);
    }
    return process.env.CCI_SECRETS_FILE;
  }
  const dedicated = path.join(apiDir, ".secrets.env");
  if (existsSync(dedicated)) return dedicated;
  const devVars = path.join(apiDir, ".dev.vars");
  if (existsSync(devVars)) return devVars;
  console.error(
    "シークレットファイルが見つかりません。\n" +
      `  cp ${path.join("apps", "api", ".secrets.env.example")} ${path.join("apps", "api", ".secrets.env")}\n` +
      "  にキーを記入して再実行してください。"
  );
  process.exit(1);
}

function loadSecrets() {
  const file = findSecretsFile();
  const secrets = parseEnvFile(readFileSync(file, "utf8"));
  if (path.resolve(file) === path.resolve(path.join(apiDir, ".dev.vars"))) {
    for (const key of NON_SECRET_KEYS) delete secrets[key];
  }
  const entries = Object.entries(secrets).filter(([, v]) => v !== "");
  if (entries.length === 0) {
    console.error("設定するシークレットがありません（空欄のみ）。");
    process.exit(1);
  }
  return { file, entries };
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: apiDir,
    encoding: "utf8",
    stdio: opts.input !== undefined ? ["pipe", "inherit", "inherit"] : "inherit",
    ...(opts.input !== undefined ? { input: opts.input } : {}),
  });
  if (res.status !== 0) {
    console.error(`コマンド失敗: ${cmd} ${args.join(" ")}`);
    process.exit(res.status ?? 1);
  }
}

async function fetchStatus(url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`  ⚠ ステータス確認に失敗しました（HTTP ${res.status}）: ${url}`);
    return null;
  }
  return res.json();
}

async function showProviderStatus(url) {
  const data = await fetchStatus(url);
  if (!data?.data) return;
  const d = data.data;
  console.log(`\n--- AIプロバイダー状態（${url}） ---`);
  console.log(`選択中: ${d.provider_label ?? d.provider}${d.model ? ` / ${d.model}` : ""}`);
  for (const p of d.providers ?? []) {
    console.log(`  ${p.label.padEnd(12)} ${p.configured ? "✅ configured" : "未設定"}  model: ${p.model ?? "—"}`);
  }
}

async function syncCloudflare(dryRun) {
  const { file, entries } = loadSecrets();
  console.log(`シークレット元: ${file}`);
  for (const [key, value] of entries) {
    console.log(`${dryRun ? "[dry-run] " : ""}secret put ${key} -> ${workerName}`);
    if (dryRun) continue;
    run(wranglerBin, ["secret", "put", key, "--name", workerName], { input: `${value}\n` });
  }
  console.log(`${dryRun ? "[dry-run] " : ""}wrangler deploy（API Worker）`);
  if (!dryRun) run(wranglerBin, ["deploy"]);
  if (!dryRun) await showProviderStatus(apiStatusUrl);
}

async function syncLocal(dryRun) {
  const { file, entries } = loadSecrets();
  const envPath = process.env.CCI_ENV_FILE || "/etc/cci/cci.env";
  console.log(`シークレット元: ${file}`);
  console.log(`反映先: ${envPath}`);
  if (dryRun) {
    for (const [key] of entries) console.log(`[dry-run] ${key}=<値> を追記/更新`);
    return;
  }
  let lines = [];
  try {
    if (existsSync(envPath)) lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  } catch (e) {
    if (e?.code === "EACCES") {
      console.error(`\n${envPath} を読み込めません（権限不足）。\nsudo npm run secrets:local で実行してください。`);
      process.exit(1);
    }
    throw e;
  }
  const seen = new Set();
  for (const [key, value] of entries) {
    const idx = lines.findIndex((l) => new RegExp(`^${key}=`).test(l.trim()));
    if (idx >= 0) {
      lines[idx] = `${key}=${value}`;
    } else {
      lines.push(`${key}=${value}`);
    }
    seen.add(key);
  }
  try {
    writeFileSync(envPath, lines.join("\n") + (lines.length ? "\n" : ""), { mode: 0o600 });
  } catch (e) {
    if (e?.code === "EACCES") {
      console.error(`\n${envPath} に書き込めません（権限不足）。\nsudo npm run secrets:local で実行してください。`);
      process.exit(1);
    }
    throw e;
  }
  if (process.env.CCI_SKIP_RESTART !== "1") {
    console.log("cci サービスを再起動します（systemctl restart cci）");
    const res = spawnSync("systemctl", ["restart", "cci"], { encoding: "utf8", stdio: "inherit" });
    if (res.status !== 0) console.log("⚠ systemctl restart に失敗しました（要sudo、または手動再起動してください）");
    await new Promise((r) => setTimeout(r, 6000));
  } else {
    console.log("CCI_SKIP_RESTART=1 のため再起動をスキップしました");
  }
  await showProviderStatus(localStatusUrl);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const mode = args.find((a) => ["--cloudflare", "--local", "--all"].includes(a)) ?? "--all";

if (mode === "--cloudflare" || mode === "--all") {
  await syncCloudflare(dryRun);
}
if (mode === "--local" || mode === "--all") {
  await syncLocal(dryRun);
}
console.log(dryRun ? "\n[dry-run] 完了（何も変更していません）" : "\n完了。");
