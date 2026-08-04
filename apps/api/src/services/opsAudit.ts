import type { Sql } from "../lib/db";

export async function listOperationAudit(
  sql: Sql,
  filters: { actor?: string; action?: string; limit?: number } = {}
) {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.actor) {
    params.push(filters.actor);
    conds.push(`actor_email = $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    conds.push(`action = $${params.length}`);
  }
  params.push(Math.min(Math.max(filters.limit ?? 100, 1), 500));
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await sql(
    `
      SELECT id, actor_email, actor_role, action, resource_type, resource_id,
             detail, ip_address,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
      FROM operation_audit_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params
  );
  return rows;
}
