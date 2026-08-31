import type { Sql } from "./db";
import type { Env } from "../types";
import { notify, runSchedule } from "../services/schedules";

export function computeNextRun(
  scheduleType: string,
  expectedDay: number | null,
  from: Date
): Date {
  const next = new Date(from);
  if (scheduleType === "monthly") {
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    if (expectedDay) {
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(expectedDay, lastDay));
    }
  } else if (scheduleType === "yearly") {
    next.setDate(1);
    next.setFullYear(next.getFullYear() + 1);
    if (expectedDay) {
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(expectedDay, lastDay));
    }
  } else {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function staleThresholdDays(
  scheduleType: string,
  expectedIntervalDays: number | null
): number {
  const plannedDays = expectedIntervalDays
    ?? (scheduleType === "monthly" ? 31 : scheduleType === "yearly" ? 365 : 1);
  return plannedDays * 2;
}

async function notifiedRecently(sql: Sql, key: string, hours = 24): Promise<boolean> {
  const rows = await sql`
    SELECT id FROM notifications_log
    WHERE subject = ${key}
      AND created_at > now() - (${hours} || ' hours')::interval
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function runScheduledJobs(
  sql: Sql,
  env: Env,
  now: Date = new Date(),
  options: { leaseSeconds?: number; retrySeconds?: number } = {}
): Promise<{ ran: number; failed: number; stale_notified: number; fetch_failures_notified: number }> {
  const leaseSeconds = options.leaseSeconds ?? 900;
  const retrySeconds = options.retrySeconds ?? 3600;
  const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000);
  let ran = 0;
  let failed = 0;
  while (true) {
    const [schedule] = await sql`
      WITH candidate AS (
        SELECT id
        FROM fetch_schedules
        WHERE enabled = true
          AND (next_run_at IS NULL OR next_run_at <= ${now})
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE fetch_schedules fs
      SET next_run_at = ${leaseUntil}
      FROM candidate
      WHERE fs.id = candidate.id
      RETURNING fs.id, fs.schedule_type, fs.expected_day
    `;
    if (!schedule) break;

    try {
      const result = await runSchedule(sql, env, schedule.id);
      const succeeded = result.status !== "error";
      const next = succeeded
        ? computeNextRun(schedule.schedule_type, schedule.expected_day, now)
        : new Date(now.getTime() + retrySeconds * 1000);
      await sql`
        UPDATE fetch_schedules SET next_run_at = ${next} WHERE id = ${schedule.id}
      `;
      if (succeeded) ran++;
      else failed++;
    } catch (e) {
      failed++;
      console.error("scheduled_run_failed", schedule.id, e);
      const retryAt = new Date(now.getTime() + retrySeconds * 1000);
      await sql`
        UPDATE fetch_schedules SET next_run_at = ${retryAt} WHERE id = ${schedule.id}
      `;
    }
  }

  // 未更新・未取得の検知と通知（1日1回に抑制）
  const active = await sql`
    SELECT fs.id, fs.data_source_id, fs.schedule_type, fs.expected_interval_days,
           fs.notify_channels, ds.source_name, ds.source_code, ds.last_fetched_at,
           ds.source_url, ds.is_active
    FROM fetch_schedules fs
    JOIN data_sources ds ON ds.id = fs.data_source_id
    WHERE fs.enabled = true AND ds.is_active = true
  `;
  let staleNotified = 0;
  for (const s of active) {
    const intervalDays = staleThresholdDays(s.schedule_type, s.expected_interval_days);
    const channels = Array.isArray(s.notify_channels) ? (s.notify_channels as string[]) : ["teams", "slack"];
    const sourceKey = `[CCI] 未更新: ${s.source_name}`;
    if (await notifiedRecently(sql, sourceKey)) continue;
    if (s.last_fetched_at == null) {
      await notify(sql, env, channels, sourceKey, `${s.source_name}: まだ一度も取得されていません。定期取得の設定を確認してください。`);
      staleNotified++;
    } else {
      const last = new Date(s.last_fetched_at);
      const days = (now.getTime() - last.getTime()) / 86_400_000;
      if (days > intervalDays) {
        await notify(sql, env, channels, sourceKey, `${s.source_name}: 最終取得から${Math.floor(days)}日経過しています（目安: ${intervalDays}日）。未更新です。`);
        staleNotified++;
      }
    }
  }

  const failedJobs = await sql`
    SELECT sf.id, sf.file_name, ds.source_name, tl.transform_status,
           tl.success_rows, tl.error_rows
    FROM transform_logs tl
    JOIN source_files sf ON sf.id = tl.source_file_id
    JOIN data_sources ds ON ds.id = sf.data_source_id
    WHERE tl.transform_status IN ('failed', 'partial_success')
      AND COALESCE(tl.finished_at, tl.created_at) >= ${new Date(now.getTime() - 86_400_000)}
    ORDER BY COALESCE(tl.finished_at, tl.created_at) DESC
    LIMIT 100
  `;
  let fetchFailuresNotified = 0;
  for (const job of failedJobs) {
    const subject = `[CCI] 取込エラー: ${job.id}`;
    if (await notifiedRecently(sql, subject)) continue;
    await notify(
      sql,
      env,
      ["teams", "slack"],
      subject,
      `${job.source_name} / ${job.file_name}: ${job.transform_status}（成功 ${job.success_rows ?? 0} / エラー ${job.error_rows ?? 0}）`
    );
    fetchFailuresNotified++;
  }

  return {
    ran,
    failed,
    stale_notified: staleNotified,
    fetch_failures_notified: fetchFailuresNotified,
  };
}

export function schedulesForNextRun(now: Date): Date[] {
  // テスト用ヘルパー: daily / monthly / yearly の次回実行日を返す
  return ["daily", "monthly", "yearly"].map((t) => computeNextRun(t, 25, now));
}
