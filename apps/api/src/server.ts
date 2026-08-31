import { serve } from "@hono/node-server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./index";

// Development convenience: load apps/api/.dev.vars (gitignored) when the
// environment variables are not provided (e.g. by systemd EnvironmentFile).
function loadDevVars() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", ".dev.vars"),
    path.resolve(process.cwd(), ".dev.vars"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
    return;
  }
}

if (process.env.DATABASE_URL === undefined) loadDevVars();

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  ADMIN_API_KEY: process.env.ADMIN_API_KEY ?? "",
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? "",
  APP_VERSION: process.env.APP_VERSION ?? "0.1.0",
  BASIC_AUTH_USERNAME: process.env.BASIC_AUTH_USERNAME ?? "",
  BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD ?? "",
  FETCH_ALLOWED_HOSTS: process.env.FETCH_ALLOWED_HOSTS ?? "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? "",
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL ?? "",
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY ?? "",
  PERPLEXITY_MODEL: process.env.PERPLEXITY_MODEL ?? "",
  AI_MODEL: process.env.AI_MODEL ?? "",
  AI_PROVIDER: process.env.AI_PROVIDER ?? "",
  NOTIFY_TEAMS_URL: process.env.NOTIFY_TEAMS_URL ?? "",
  NOTIFY_SLACK_URL: process.env.NOTIFY_SLACK_URL ?? "",
  CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN ?? "",
  CF_ACCESS_AUD: process.env.CF_ACCESS_AUD ?? "",
  PDF_CJK_FONT_URL: process.env.PDF_CJK_FONT_URL ?? "",
  AUTH_TRUST_PROXY: process.env.AUTH_TRUST_PROXY ?? "",
  ALLOW_ANONYMOUS_VIEWER: process.env.ALLOW_ANONYMOUS_VIEWER ?? "",
  READ_ONLY_MODE: process.env.READ_ONLY_MODE ?? "",
  RATE_LIMIT_PER_MINUTE: process.env.RATE_LIMIT_PER_MINUTE ?? "",
  REQUEST_LOGGING: process.env.REQUEST_LOGGING ?? "true",
  AI_ROUTING: process.env.AI_ROUTING ?? "",
};

const port = Number(process.env.API_PORT ?? process.env.PORT ?? "8100");
const hostname = process.env.API_HOST ?? "0.0.0.0";

const server = serve(
  {
    port,
    hostname,
    fetch: (request) => app.fetch(request, env),
  },
  (info) => {
    console.log(`cci-api listening on http://${info.address}:${info.port}`);
  }
);

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`cci-api received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
