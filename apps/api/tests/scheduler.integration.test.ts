import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { closeSqlConnections, getSql } from "../src/lib/db";
import { runScheduledJobs } from "../src/lib/scheduler";
import type { Env } from "../src/types";

const hasDb = Boolean(process.env.DATABASE_URL);
const env: Env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  ADMIN_API_KEY: "",
  CORS_ORIGINS: "",
  APP_VERSION: "test",
};

let client: Client;

beforeAll(async () => {
  if (!hasDb) return;
  client = new Client({ connectionString: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  if (!hasDb) return;
  await client.end();
  await closeSqlConnections();
});

describe.skipIf(!hasDb)("local scheduler integration", () => {
  it("claims a due schedule once and backs off after a failed fetch", async () => {
    const sourceCode = `SCHEDULER_TEST_${Date.now()}`;
    const sourceResult = await client.query<{ id: string }>(`
      INSERT INTO data_sources
        (source_code, source_name, source_type, provider_name, source_url, file_format, is_active)
      VALUES ($1, 'Scheduler integration test', 'material', 'test',
              'http://127.0.0.1/private.csv', 'csv', true)
      RETURNING id
    `, [sourceCode]);
    const sourceId = sourceResult.rows[0].id;
    const scheduleResult = await client.query<{ id: string }>(`
      INSERT INTO fetch_schedules
        (data_source_id, schedule_name, schedule_type, enabled, approval_required,
         notify_channels, next_run_at, created_by)
      VALUES ($1, 'Scheduler integration test', 'daily', true, true, '[]'::jsonb,
              now() - interval '1 minute', 'integration-test')
      RETURNING id
    `, [sourceId]);
    const scheduleId = scheduleResult.rows[0].id;

    try {
      const sql = getSql(env);
      const now = new Date();
      const results = await Promise.all([
        runScheduledJobs(sql, env, now, { retrySeconds: 120 }),
        runScheduledJobs(sql, env, now, { retrySeconds: 120 }),
      ]);

      expect(results.reduce((total, result) => total + result.ran, 0)).toBe(0);
      expect(results.reduce((total, result) => total + result.failed, 0)).toBe(1);

      const state = await client.query<{
        last_status: string;
        last_run_at: Date;
        next_run_at: Date;
      }>(`
        SELECT last_status, last_run_at, next_run_at
        FROM fetch_schedules
        WHERE id = $1
      `, [scheduleId]);
      expect(state.rows[0].last_status).toBe("error");
      expect(state.rows[0].last_run_at).toBeInstanceOf(Date);
      expect(state.rows[0].next_run_at.getTime()).toBe(now.getTime() + 120_000);

      const staleSubject = "[CCI] 未更新: Scheduler integration test";
      const notificationCount = await client.query<{ count: string }>(
        "SELECT count(*) FROM notifications_log WHERE subject = $1",
        [staleSubject]
      );
      await runScheduledJobs(sql, env, new Date(now.getTime() + 1000), { retrySeconds: 120 });
      const notificationCountAfter = await client.query<{ count: string }>(
        "SELECT count(*) FROM notifications_log WHERE subject = $1",
        [staleSubject]
      );
      expect(notificationCountAfter.rows[0].count).toBe(notificationCount.rows[0].count);

      const sourceFile = await client.query<{ id: string }>(`
        INSERT INTO source_files
          (data_source_id, file_name, file_format, file_hash, fetch_status)
        VALUES ($1, 'partial.csv', 'csv', $2, 'success')
        RETURNING id
      `, [sourceId, "a".repeat(64)]);
      await client.query(`
        INSERT INTO transform_logs
          (source_file_id, transform_status, total_rows, success_rows, error_rows, finished_at)
        VALUES ($1, 'partial_success', 3, 2, 1, $2)
      `, [sourceFile.rows[0].id, now]);

      const failureNotification = await runScheduledJobs(
        sql,
        env,
        new Date(now.getTime() + 2000),
        { retrySeconds: 120 }
      );
      expect(failureNotification.fetch_failures_notified).toBe(1);
      const repeatedFailureNotification = await runScheduledJobs(
        sql,
        env,
        new Date(now.getTime() + 3000),
        { retrySeconds: 120 }
      );
      expect(repeatedFailureNotification.fetch_failures_notified).toBe(0);
    } finally {
      await client.query("DELETE FROM fetch_schedules WHERE id = $1", [scheduleId]);
      await client.query(`
        DELETE FROM transform_logs
        WHERE source_file_id IN (SELECT id FROM source_files WHERE data_source_id = $1)
      `, [sourceId]);
      await client.query("DELETE FROM source_files WHERE data_source_id = $1", [sourceId]);
      await client.query("DELETE FROM data_sources WHERE id = $1", [sourceId]);
      await client.query(
        "DELETE FROM notifications_log WHERE subject LIKE '%Scheduler integration test%'"
      );
    }
  });
});
