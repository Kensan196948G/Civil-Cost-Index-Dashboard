import type { Sql } from "../lib/db";
import { ALL_ROLES, type Identity, type Role } from "../lib/auth";

export async function listUsers(sql: Sql) {
  const rows = await sql`
    SELECT id, email, display_name, roles, is_active, created_at, updated_at
    FROM users
    ORDER BY email
  `;
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    display_name: r.display_name,
    roles: r.roles,
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

function validateRoles(roles: unknown): Role[] {
  if (!Array.isArray(roles)) return ["viewer"];
  const valid = roles.filter((r): r is Role => (ALL_ROLES as readonly string[]).includes(String(r)));
  if (!valid.includes("viewer")) valid.unshift("viewer");
  return valid;
}

export async function createUser(
  sql: Sql,
  input: { email: string; display_name?: string | null; roles?: string[] },
  _identity: Identity
) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error("メールアドレスの形式が不正です。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const roles = validateRoles(input.roles);
  try {
    const [row] = await sql`
      INSERT INTO users (email, display_name, roles, is_active)
      VALUES (${email}, ${input.display_name?.trim() || null}, ${JSON.stringify(roles)}, true)
      RETURNING id, email, display_name, roles, is_active, created_at, updated_at
    `;
    return row;
  } catch (e) {
    if (String(e).includes("duplicate key")) {
      const err = new Error(`${email} は既に登録されています。`);
      (err as Error & { status?: number }).status = 409;
      throw err;
    }
    throw e;
  }
}

export async function updateUser(
  sql: Sql,
  id: string,
  input: { display_name?: string | null; roles?: string[]; is_active?: boolean },
  _identity: Identity
) {
  const currentRows = await sql`
    SELECT email, display_name, roles, is_active FROM users WHERE id = ${id}
  `;
  if (currentRows.length === 0) return null;
  const current = currentRows[0];
  const roles = input.roles !== undefined ? validateRoles(input.roles) : current.roles;
  const [row] = await sql`
    UPDATE users SET
      display_name = ${
        input.display_name === undefined
          ? current.display_name
          : input.display_name === null
            ? null
            : input.display_name.trim() || null
      },
      roles = ${JSON.stringify(roles)},
      is_active = ${input.is_active ?? current.is_active},
      updated_at = now()
    WHERE id = ${id}
    RETURNING id, email, display_name, roles, is_active, created_at, updated_at
  `;
  return row;
}

export async function deleteUser(sql: Sql, id: string) {
  const [row] = await sql`
    DELETE FROM users WHERE id = ${id} RETURNING id
  `;
  return row ?? null;
}
