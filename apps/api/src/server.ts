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
