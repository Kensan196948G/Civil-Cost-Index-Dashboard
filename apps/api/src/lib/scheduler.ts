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

async function notifiedRecently(sql: Sql, key: string, hours = 24): Promise<boolean> {
  const rows = await sql`
    SELECT id FROM notifications_log
    WHERE message LIKE ${`%${key}%`}
      AND status = 'success'
      AND created_at > now() - (${hours} || ' hours')::interval
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function runScheduledJobs(
  sql: Sql,
  env: Env,
  now: Date = new Date()
): Promise<{ ran: number; stale_notified: number }> {
  const due = await sql`
    SELECT fs.*, ds.source_name, ds.source_code
    FROM fetch_schedules fs
    JOIN data_sources ds ON ds.id = fs.data_source_id
    WHERE fs.enabled = true
      AND (fs.next_run_at IS NULL OR fs.next_run_at <= ${now})
    ORDER BY fs.created_at
  `;
  let ran = 0;
  for (const schedule of due) {
    try {
      await runSchedule(sql, env, schedule.id);
      const next = computeNextRun(schedule.schedule_type, schedule.expected_day, now);
      await sql`
        UPDATE fetch_schedules SET next_run_at = ${next} WHERE id = ${schedule.id}
      `;
      ran++;
    } catch (e) {
      console.error("scheduled_run_failed", schedule.id, e);
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
    const intervalDays = s.expected_interval_days ?? (s.schedule_type === "monthly" ? 40 : s.schedule_type === "yearly" ? 400 : 2);
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
  return { ran, stale_notified: staleNotified };
}

export function schedulesForNextRun(now: Date): Date[] {
  // テスト用ヘルパー: daily / monthly / yearly の次回実行日を返す
  return ["daily", "monthly", "yearly"].map((t) => computeNextRun(t, 25, now));
}
