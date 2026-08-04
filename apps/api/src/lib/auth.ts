import type { Env } from "../types";
import type { Sql } from "./db";

export const ALL_ROLES = [
  "viewer",
  "data_ingester",
  "data_approver",
  "estimator",
  "estimating_manager",
  "auditor",
  "system_admin",
] as const;

export type Role = (typeof ALL_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  viewer: "閲覧者",
  data_ingester: "データ取込担当",
  data_approver: "データ承認者",
  estimator: "積算担当",
  estimating_manager: "積算責任者",
  auditor: "監査者",
  system_admin: "システム管理者",
};

export type Identity = {
  email: string;
  display_name: string | null;
  roles: string[];
  source: "admin-key" | "access-jwt" | "trusted-header" | "anonymous";
};

export class AuthError extends Error {
  status: number;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

/** HonoのContextのうち認証で使う部分のみ（構造的型付け） */
export type AuthContext = {
  req: { header(name: string): string | undefined };
  env: Env;
};

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlToBuffer(input: string): ArrayBuffer {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return bytes.buffer;
}

type JwkKey = {
  kid: string;
  alg?: string;
  use?: string;
  kty: string;
  n?: string;
  e?: string;
};

let cachedKeys: { kid: string; cryptoKey: CryptoKey }[] | null = null;

async function getAccessSigningKeys(env: Env): Promise<{ kid: string; cryptoKey: CryptoKey }[] | null> {
  const domain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  if (!domain) return null;
  if (cachedKeys) return cachedKeys;
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) return null;
  const data = (await res.json()) as { keys?: JwkKey[] };
  const keys = (data.keys ?? [])
    .filter((k) => k.use === "sig" && k.kty === "RSA" && k.n && k.e)
    .map((k) => ({
      kid: k.kid,
      jwk: { kty: k.kty, n: k.n, e: k.e, alg: k.alg ?? "RS256" } as JsonWebKey,
    }));
  const imported: { kid: string; cryptoKey: CryptoKey }[] = [];
  for (const k of keys) {
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      k.jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    imported.push({ kid: k.kid, cryptoKey });
  }
  cachedKeys = imported;
  return cachedKeys;
}

export async function verifyAccessJwt(
  jwt: string,
  env: Env
): Promise<{ email?: string; name?: string } | null> {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const header = JSON.parse(base64UrlDecode(h)) as { kid?: string; alg?: string };
    const payload = JSON.parse(base64UrlDecode(p)) as {
      email?: string;
      name?: string;
      aud?: string | string[];
      exp?: number;
    };
    if (env.CF_ACCESS_AUD) {
      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud ?? ""];
      if (!aud.includes(env.CF_ACCESS_AUD)) return null;
    }
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    if (!header.kid) return null;
    const keys = await getAccessSigningKeys(env);
    const key = keys?.find((k) => k.kid === header.kid);
    if (!key) return null;
    const data = new TextEncoder().encode(`${h}.${p}`);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key.cryptoKey, base64UrlToBuffer(s), data);
    if (!ok) return null;
    return { email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

export async function resolveIdentity(
  c: AuthContext,
  sql: Sql
): Promise<Identity> {
  const adminKey = c.req.header("X-Admin-Key") ?? "";
  if (adminKey && adminKey === (c.env.ADMIN_API_KEY ?? "").trim()) {
    return {
      email: "admin-key",
      display_name: "システム管理者（Admin Key）",
      roles: [...ALL_ROLES],
      source: "admin-key",
    };
  }

  if (c.env.AUTH_TRUST_PROXY === "true") {
    const email = c.req.header("X-User-Email")?.trim();
    const rolesHeader = c.req.header("X-User-Roles")?.trim();
    if (email) {
      const roles = rolesHeader
        ? rolesHeader.split(",").map((r) => r.trim()).filter((r) => (ALL_ROLES as readonly string[]).includes(r))
        : ["viewer"];
      return {
        email,
        display_name: email,
        roles: roles.length ? roles : ["viewer"],
        source: "trusted-header",
      };
    }
  }

  const jwt = c.req.header("CF-Access-Jwt-Assertion");
  if (jwt) {
    const payload = await verifyAccessJwt(jwt, c.env);
    if (payload?.email) {
      const users = await sql`
        SELECT email, display_name, roles, is_active FROM users
        WHERE email = ${payload.email} AND is_active = true
      `;
      if (users.length > 0) {
        return {
          email: String(users[0].email),
          display_name: (users[0].display_name as string | null) ?? payload.name ?? null,
          roles: Array.isArray(users[0].roles) ? (users[0].roles as string[]) : ["viewer"],
          source: "access-jwt",
        };
      }
      return {
        email: payload.email,
        display_name: payload.name ?? null,
        roles: ["viewer"],
        source: "access-jwt",
      };
    }
  }

  return { email: "anonymous", display_name: null, roles: ["viewer"], source: "anonymous" };
}

export function hasRole(identity: Identity, required: string[]): boolean {
  return identity.roles.some((r) => required.includes(r));
}

export async function requireRole(
  c: AuthContext,
  sql: Sql,
  required: string[]
): Promise<Identity> {
  const identity = await resolveIdentity(c, sql);
  if (!hasRole(identity, required)) {
    throw new AuthError(
      identity.source === "anonymous" ? 401 : 403,
      identity.source === "anonymous"
        ? "認証が必要です（Admin KeyまたはCloudflare Access）。"
        : `権限が不足しています。必要な役割: ${required.join(" / ")}`
    );
  }
  return identity;
}
