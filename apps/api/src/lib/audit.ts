import type { Sql } from "./db";
import type { Identity } from "./auth";

export async function recordAudit(
  sql: Sql,
  identity: Identity,
  action: string,
  resourceType?: string,
  resourceId?: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await sql`
      INSERT INTO operation_audit_logs
        (actor_email, actor_role, action, resource_type, resource_id, detail)
      VALUES
        (${identity.email}, ${identity.roles[0] ?? "viewer"}, ${action},
         ${resourceType ?? null}, ${resourceId ?? null}, ${detail ? JSON.stringify(detail) : null})
    `;
  } catch (e) {
    // 監査ログは fail-safe（本体処理を妨げない）
    console.error("audit_log_failed", e);
  }
}
