import type { Sql } from "./db";
import type { Identity } from "./auth";

/**
 * 監査ログに記録する代表役割。
 * 複数役割を持つidentity（例: X-Admin-Keyは全7役割）では、ALL_ROLESの先頭がviewerのため
 * roles[0]では「システム管理者の操作がviewerとして記録される」不整合が発生する。
 * 操作に使用した最高権限役割を代表値として記録する。
 */
function representativeRole(roles: string[]): string {
  if (roles.includes("system_admin")) return "system_admin";
  return roles[0] ?? "viewer";
}

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
        (${identity.email}, ${representativeRole(identity.roles)}, ${action},
         ${resourceType ?? null}, ${resourceId ?? null}, ${detail ? JSON.stringify(detail) : null})
    `;
  } catch (e) {
    // 監査ログは fail-safe（本体処理を妨げない）
    console.error("audit_log_failed", e);
  }
}
