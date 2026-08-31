#!/usr/bin/env node
// Apply SQL migrations under ../migrations in filename order.
import { createHash } from "node:crypto";
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
  await client.query("SELECT pg_advisory_lock(hashtext('cci_schema_migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum_sha256 VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  let applied = 0;
  let skipped = 0;
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "SELECT checksum_sha256 FROM schema_migrations WHERE filename = $1",
      [file],
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].checksum_sha256 !== checksum) {
        throw new Error(`migration checksum mismatch: ${file}`);
      }
      console.log(`skipping ${file} (already applied)`);
      skipped++;
      continue;
    }

    console.log(`applying ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum_sha256) VALUES ($1, $2)",
        [file, checksum],
      );
      await client.query("COMMIT");
      applied++;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log(`migrations complete (${applied} applied, ${skipped} skipped)`);
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('cci_schema_migrations'))").catch(() => undefined);
  await client.end();
}
