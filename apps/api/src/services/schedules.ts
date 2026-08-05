import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Env } from "../types";
import type { Identity } from "../lib/auth";
import { downloadAndParseUrl } from "./fetchUrl";
import { ingestRows } from "./ingest";

export const scheduleSchema = z.object({
  data_source_id: z.string().min(1),
  schedule_name: z.string().max(200).optional().nullable(),
  schedule_type: z.enum(["daily", "monthly", "yearly"]).default("daily"),
  expected_day: z.number().int().min(1).max(31).optional().nullable(),
  expected_interval_days: z.number().int().min(1).optional().nullable(),
  enabled: z.boolean().optional(),
  approval_required: z.boolean().optional(),
  notify_channels: z.array(z.enum(["teams", "slack"])).optional(),
});

export const schedulePatchSchema = scheduleSchema.partial();

const CHANNELS = ["teams", "slack"] as const;

export async function sendNotification(
  sql: Sql,
  env: Pick<Env, "NOTIFY_TEAMS_URL" | "NOTIFY_SLACK_URL">,
  channel: (typeof CHANNELS)[number],
  subject: string,
  message: string
): Promise<void> {
  const url = channel === "teams" ? env.NOTIFY_TEAMS_URL : env.NOTIFY_SLACK_URL;
  if (!url) {
    await sql`
      INSERT INTO notifications_log (channel, subject, message, status, error_message)
      VALUES (${channel}, ${subject}, ${message}, 'skipped', 'Webhook URL未設定')
    `;
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await sql`
      INSERT INTO notifications_log (channel, subject, message, status)
      VALUES (${channel}, ${subject}, ${message}, 'success')
    `;
  } catch (e) {
    await sql`
      INSERT INTO notifications_log (channel, subject, message, status, error_message)
      VALUES (${channel}, ${subject}, ${message}, 'error', ${String(e)})
    `;
    console.error("notification_failed", channel, e);
  }
}

export async function notify(
  sql: Sql,
  env: Pick<Env, "NOTIFY_TEAMS_URL" | "NOTIFY_SLACK_URL">,
  channels: string[],
  subject: string,
  message: string
): Promise<void> {
  const targets = (channels.length ? channels : ["teams", "slack"]) as (typeof CHANNELS)[number][];
  for (const channel of targets) {
    if (!CHANNELS.includes(channel)) continue;
    await sendNotification(sql, env, channel, subject, message);
  }
}

/** AI候補の承認依頼を通知（未設定時は notifications_log に skipped として記録） */
export async function notifyAiApproval(
  sql: Sql,
  env: Pick<Env, "NOTIFY_TEAMS_URL" | "NOTIFY_SLACK_URL">,
  subject: string,
  message: string
): Promise<void> {
  await notify(sql, env, ["teams", "slack"], subject, message);
}

export async function listSchedules(sql: Sql) {
  const rows = await sql`
    SELECT fs.id, fs.data_source_id, ds.source_name, ds.source_code,
           fs.schedule_name, fs.schedule_type, fs.expected_day, fs.expected_interval_days,
           fs.enabled, fs.approval_required, fs.notify_channels, fs.next_run_at,
           fs.last_run_at, fs.last_status, fs.created_by,
           to_char(fs.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
           to_char(fs.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
    FROM fetch_schedules fs
    JOIN data_sources ds ON ds.id = fs.data_source_id
    ORDER BY ds.source_code, fs.created_at
  `;
  return rows;
}

export async function createSchedule(
  sql: Sql,
  input: z.infer<typeof scheduleSchema>,
  identity: Identity
) {
  const sourceRows = await sql`SELECT id FROM data_sources WHERE id = ${input.data_source_id}`;
  if (sourceRows.length === 0) {
    const err = new Error("データソースが見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const [row] = await sql`
    INSERT INTO fetch_schedules
      (data_source_id, schedule_name, schedule_type, expected_day, expected_interval_days,
       enabled, approval_required, notify_channels, created_by)
    VALUES
      (${input.data_source_id}, ${input.schedule_name ?? null}, ${input.schedule_type},
       ${input.expected_day ?? null}, ${input.expected_interval_days ?? null},
       ${input.enabled ?? true}, ${input.approval_required ?? true},
       ${JSON.stringify(input.notify_channels ?? ["teams", "slack"])}, ${identity.email})
    RETURNING id
  `;
  return row.id;
}

export async function updateSchedule(
  sql: Sql,
  id: string,
  input: z.infer<typeof schedulePatchSchema>
) {
  const cur = await sql`SELECT * FROM fetch_schedules WHERE id = ${id}`;
  if (cur.length === 0) return null;
  const c = cur[0];
  const [row] = await sql`
    UPDATE fetch_schedules SET
      data_source_id = ${input.data_source_id ?? c.data_source_id},
      schedule_name = ${input.schedule_name !== undefined ? input.schedule_name : c.schedule_name},
      schedule_type = ${input.schedule_type ?? c.schedule_type},
      expected_day = ${input.expected_day !== undefined ? input.expected_day : c.expected_day},
      expected_interval_days = ${input.expected_interval_days !== undefined ? input.expected_interval_days : c.expected_interval_days},
      enabled = ${input.enabled ?? c.enabled},
      approval_required = ${input.approval_required ?? c.approval_required},
      notify_channels = ${JSON.stringify(input.notify_channels ?? c.notify_channels)},
      updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return row.id;
}

export async function runSchedule(
  sql: Sql,
  env: Env,
  scheduleId: string,
  identity?: Identity
) {
  const rows = await sql`
    SELECT fs.*, ds.source_name, ds.source_code
    FROM fetch_schedules fs
    JOIN data_sources ds ON ds.id = fs.data_source_id
    WHERE fs.id = ${scheduleId}
  `;
  if (rows.length === 0) {
    const err = new Error("スケジュールが見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const s = rows[0];
  const channels = Array.isArray(s.notify_channels) ? (s.notify_channels as string[]) : ["teams", "slack"];
  const subject = `[CCI] 定期取込: ${s.source_name}`;
  try {
    const parsed = await downloadAndParseUrl(sql, { dataSourceId: s.data_source_id }, env);
    if (parsed.duplicate) {
      await sql`
        UPDATE fetch_schedules SET last_run_at = now(), last_status = 'duplicate' WHERE id = ${scheduleId}
      `;
      await notify(sql, env, channels, subject, `${s.source_name}: 同一内容のためスキップしました。`);
      return { status: "duplicate" };
    }
    if (s.approval_required) {
      const [staged] = await sql`
        INSERT INTO staged_ingestions
          (data_source_id, schedule_id, file_name, file_hash, original_url,
           staged_rows, total_rows, error_rows, created_by)
        VALUES
          (${s.data_source_id}, ${scheduleId}, ${parsed.fileName}, ${parsed.fileHash},
           ${parsed.finalUrl}, ${JSON.stringify(parsed.rows)},
           ${parsed.rows.length + parsed.extraErrorRows.length}, ${parsed.extraErrorRows.length},
           ${identity?.email ?? "system"})
        RETURNING id
      `;
      await sql`
        UPDATE fetch_schedules SET last_run_at = now(), last_status = 'staged' WHERE id = ${scheduleId}
      `;
      await notify(
        sql,
        env,
        channels,
        subject,
        `${s.source_name}: 取込データ${parsed.rows.length}行を承認待ちにしました（ID: ${staged.id}）。承認後に本番反映されます。`
      );
      return { status: "staged", staged_id: staged.id, rows: parsed.rows.length };
    }
    const result = await ingestRows({
      sql,
      dataSourceId: s.data_source_id,
      rows: parsed.rows,
      fileName: parsed.fileName,
      fileHash: parsed.fileHash,
      jobType: "manual_fetch",
      originalUrl: parsed.finalUrl,
      fileFormat: parsed.format,
      extraErrorRows: parsed.extraErrorRows,
    });
    await sql`
      UPDATE fetch_schedules SET last_run_at = now(), last_status = 'success' WHERE id = ${scheduleId}
    `;
    await notify(
      sql,
      env,
      channels,
      subject,
      `${s.source_name}: 取込完了（成功 ${result.success_rows} / エラー ${result.error_rows}）。`
    );
    return { status: "success", rows: result.success_rows };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sql`
      UPDATE fetch_schedules SET last_run_at = now(), last_status = 'error' WHERE id = ${scheduleId}
    `;
    await notify(sql, env, channels, subject, `${s.source_name}: 定期取込に失敗しました。\n${message}`);
    return { status: "error", message };
  }
}

export async function listStaged(sql: Sql, status?: string) {
  const rows = status
    ? await sql`
        SELECT si.id, si.data_source_id, ds.source_name, ds.source_code,
               si.schedule_id, si.file_name, si.file_hash, si.original_url,
               si.total_rows, si.error_rows, si.status, si.created_by,
               si.reviewed_by, si.reviewed_at,
               to_char(si.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
        FROM staged_ingestions si
        JOIN data_sources ds ON ds.id = si.data_source_id
        WHERE si.status = ${status}
        ORDER BY si.created_at DESC
      `
    : await sql`
        SELECT si.id, si.data_source_id, ds.source_name, ds.source_code,
               si.schedule_id, si.file_name, si.file_hash, si.original_url,
               si.total_rows, si.error_rows, si.status, si.created_by,
               si.reviewed_by, si.reviewed_at,
               to_char(si.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
        FROM staged_ingestions si
        JOIN data_sources ds ON ds.id = si.data_source_id
        ORDER BY si.created_at DESC
      `;
  return rows;
}

export async function approveStaged(sql: Sql, id: string, identity: Identity) {
  const rows = await sql`
    SELECT * FROM staged_ingestions WHERE id = ${id} AND status = 'pending'
  `;
  if (rows.length === 0) return null;
  const staged = rows[0];
  const result = await ingestRows({
    sql,
    dataSourceId: staged.data_source_id,
    rows: staged.staged_rows as Array<Record<string, string>>,
    fileName: staged.file_name ?? "staged.csv",
    fileHash: staged.file_hash ?? `staged-${staged.id}`,
    jobType: "manual_fetch",
    originalUrl: staged.original_url,
    fileFormat: staged.file_name?.endsWith(".xlsx") ? "xlsx" : "csv",
  });
  await sql`
    UPDATE staged_ingestions SET status = 'approved', reviewed_by = ${identity.email}, reviewed_at = now()
    WHERE id = ${id}
  `;
  return { staged_id: id, ...result };
}

export async function rejectStaged(sql: Sql, id: string, identity: Identity) {
  const [row] = await sql`
    UPDATE staged_ingestions SET status = 'rejected', reviewed_by = ${identity.email}, reviewed_at = now()
    WHERE id = ${id} AND status = 'pending'
    RETURNING id
  `;
  return row ?? null;
}

export async function deleteSchedule(sql: Sql, id: string) {
  const [row] = await sql`
    DELETE FROM fetch_schedules WHERE id = ${id} RETURNING id
  `;
  return row ?? null;
}

export async function deleteStaged(sql: Sql, id: string) {
  const [row] = await sql`
    DELETE FROM staged_ingestions WHERE id = ${id} RETURNING id
  `;
  return row ?? null;
}
