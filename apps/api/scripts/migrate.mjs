#!/usr/bin/env node
// Apply SQL migrations under ../migrations in filename order.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "..", "migrations");
const devVarsPath = path.resolve(__dirname, "..", ".dev.vars");
if (!process.env.DATABASE_URL && existsSync(devVarsPath)) {
  for (const line of readFileSync(devVarsPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL (or DATABASE_URL_DIRECT) is required.");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    console.log(`applying ${file}`);
    await client.query(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  console.log(`migrations complete (${files.length} files)`);
} finally {
  await client.end();
}
