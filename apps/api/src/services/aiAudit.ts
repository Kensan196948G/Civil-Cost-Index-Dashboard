import type { Sql } from "../lib/db";
import { maskSensitive } from "../lib/ai";

export type AiAuditEntry = {
  feature: string;
  question: string | null;
  provider: string;
  model: string | null;
  promptVersion: string | null;
  dataScope: unknown;
  responseText: string | null;
  sources: unknown;
  status: string;
  errorMessage?: string | null;
  durationMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

/**
 * AI利用監査ログを保存する。監査テーブル未作成などで失敗しても
 * 呼び出し元の機能（サマリー生成など）は継続させる（fail-safe）。
 */
export async function recordAiAudit(sql: Sql, entry: AiAuditEntry): Promise<string | null> {
  try {
    const rows = await sql`
      INSERT INTO ai_audit_logs (
        feature, question, provider, model, prompt_version, data_scope,
        response_text, sources, status, error_message, duration_ms,
        input_tokens, output_tokens
      ) VALUES (
        ${entry.feature},
        ${entry.question == null ? null : maskSensitive(entry.question)},
        ${entry.provider},
        ${entry.model},
        ${entry.promptVersion},
        ${JSON.stringify(entry.dataScope ?? null)}::jsonb,
        ${entry.responseText == null ? null : maskSensitive(entry.responseText)},
        ${JSON.stringify(entry.sources ?? null)}::jsonb,
        ${entry.status},
        ${entry.errorMessage ?? null},
        ${entry.durationMs ?? null},
        ${entry.inputTokens ?? null},
        ${entry.outputTokens ?? null}
      )
      RETURNING id
    `;
    return rows[0]?.id ? String(rows[0].id) : null;
  } catch (e) {
    console.error("ai_audit_insert_failed", e);
    return null;
  }
}

export async function listAiAudit(sql: Sql, opts: { feature?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const params: unknown[] = [];
  let where = "";
  if (opts.feature) {
    params.push(opts.feature);
    where = `WHERE feature = $${params.length}`;
  }
  params.push(limit);
  const rows = await sql(
    `
    SELECT id, feature, question, provider, model, prompt_version, data_scope,
           left(coalesce(response_text, ''), 400) AS response_preview,
           sources, status, error_message, duration_ms, input_tokens, output_tokens,
           rating, feedback_comment,
           to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
    FROM ai_audit_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  return rows;
}

const VALID_RATINGS = ["good", "bad", "inaccurate", "insufficient_evidence", "too_assertive"];

export async function submitAiFeedback(
  sql: Sql,
  input: { auditId: string; rating: string; comment?: string | null }
): Promise<boolean> {
  if (!VALID_RATINGS.includes(input.rating)) {
    const err = new Error(`rating は ${VALID_RATINGS.join("/")} のいずれかを指定してください。`);
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const rows = await sql`
    UPDATE ai_audit_logs
    SET rating = ${input.rating},
        feedback_comment = ${input.comment == null ? null : maskSensitive(input.comment)}
    WHERE id = ${input.auditId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}
