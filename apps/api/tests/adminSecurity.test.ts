import { describe, expect, it } from "vitest";
import { requireAdmin, timingSafeEqualStrings, type AppContext } from "../src/lib/http";
import { resolveIdentity, ALL_ROLES, type AuthContext } from "../src/lib/auth";
import { recordAudit } from "../src/lib/audit";
import type { Env } from "../src/types";
import type { Sql } from "../src/lib/db";

const sqlUnused: Sql = async () => [];

function makeCapturingSql(): { sql: Sql; values: unknown[][] } {
  const values: unknown[][] = [];
  const fn = ((strings: TemplateStringsArray, ...vals: unknown[]) => {
    values.push(vals);
    return Promise.resolve([] as Array<Record<string, unknown>>);
  }) as unknown as Sql;
  return { sql: fn, values };
}

describe("recordAudit representative role", () => {
  it("records system_admin as the representative role for admin-key identities", async () => {
    const { sql, values } = makeCapturingSql();
    await recordAudit(
      sql,
      { email: "admin-key", display_name: null, roles: [...ALL_ROLES], source: "admin-key" },
      "user.create",
      "user",
      "u1",
      { email: "x@x.jp" }
    );
    expect(values[0]?.[1]).toBe("system_admin");
  });

  it("records the first role for limited-role identities", async () => {
    const { sql, values } = makeCapturingSql();
    await recordAudit(sql, { email: "taro@example.com", display_name: null, roles: ["estimator", "viewer"], source: "access-jwt" }, "estimate.calculate");
    expect(values[0]?.[1]).toBe("estimator");
  });

  it("falls back to viewer for empty roles", async () => {
    const { sql, values } = makeCapturingSql();
    await recordAudit(sql, { email: "anonymous", display_name: null, roles: [], source: "anonymous" }, "read.view");
    expect(values[0]?.[1]).toBe("viewer");
  });
});

function makeCtx(envOverrides: Partial<Env> = {}, headers: Record<string, string> = {}): AppContext {
  return {
    req: { header: (name: string) => headers[name] },
    env: {
      DATABASE_URL: "postgres://dummy",
      ADMIN_API_KEY: "",
      CORS_ORIGINS: "",
      APP_VERSION: "test",
      ...envOverrides,
    },
  } as unknown as AppContext;
}

describe("timingSafeEqualStrings", () => {
  it("matches equal strings", () => {
    expect(timingSafeEqualStrings("admin-key", "admin-key")).toBe(true);
    expect(timingSafeEqualStrings("", "")).toBe(true);
  });

  it("rejects different content of the same length", () => {
    expect(timingSafeEqualStrings("admin-key", "admin-kek")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(timingSafeEqualStrings("admin-key", "admin-key-extra")).toBe(false);
    expect(timingSafeEqualStrings("x", "")).toBe(false);
  });

  it("rejects empty vs non-empty", () => {
    expect(timingSafeEqualStrings("", "secret")).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("production: fails closed when ADMIN_API_KEY is unset", () => {
    const c = makeCtx({ APP_ENV: "production" });
    expect(requireAdmin(c)).toBe(false);
  });

  it("production: fails closed on wrong key", () => {
    const c = makeCtx({ APP_ENV: "production", ADMIN_API_KEY: "real-key" }, { "X-Admin-Key": "wrong" });
    expect(requireAdmin(c)).toBe(false);
  });

  it("production: passes with correct key", () => {
    const c = makeCtx({ APP_ENV: "production", ADMIN_API_KEY: "real-key" }, { "X-Admin-Key": "real-key" });
    expect(requireAdmin(c)).toBe(true);
  });

  it("development: keeps the legacy no-key fallback (dev/demo only)", () => {
    const c = makeCtx({ APP_ENV: "development" });
    expect(requireAdmin(c)).toBe(true);
  });

  it("unset APP_ENV (dev/test defaults): keeps legacy fallback for local runs", () => {
    const c = makeCtx({});
    expect(requireAdmin(c)).toBe(true);
  });

  it("production: header with trailing whitespace fails closed against trimmed configured key", () => {
    const c = makeCtx({ APP_ENV: "production", ADMIN_API_KEY: "real-key " }, { "X-Admin-Key": "real-key " });
    // 設定値はtrim後の値と比較されるため、末尾に空白を含むヘッダーは不一致（fail closed）となる
    expect(requireAdmin(c)).toBe(false);
  });
});

describe("resolveIdentity admin key (timing-safe path)", () => {
  const env: Env = {
    DATABASE_URL: "postgres://dummy",
    ADMIN_API_KEY: "secret-key",
    CORS_ORIGINS: "",
    APP_VERSION: "test",
    APP_ENV: "production",
  };

  function authCtx(headers: Record<string, string>, envOverrides: Partial<Env> = {}): AuthContext {
    return {
      req: { header: (name: string) => headers[name] },
      env: { ...env, ...envOverrides },
    } as unknown as AuthContext;
  }

  it("accepts the correct admin key as system admin", async () => {
    const id = await resolveIdentity(authCtx({ "X-Admin-Key": "secret-key" }), sqlUnused);
    expect(id.source).toBe("admin-key");
    expect(id.roles).toContain("system_admin");
  });

  it("rejects a wrong admin key and falls back to anonymous (401 downstream)", async () => {
    const id = await resolveIdentity(authCtx({ "X-Admin-Key": "wrong-key" }), sqlUnused);
    expect(id.source).toBe("anonymous");
    expect(id.roles).toEqual([]);
  });

  it("admin key takes precedence over the Basic gate (LAN management UI usable)", async () => {
    // Basic認証環境でも X-Admin-Key が一致するリクエストは管理者として扱う（README仕様）
    const id = await resolveIdentity(
      authCtx(
        { "X-Admin-Key": "secret-key", Authorization: `Basic ${btoa("cci:pass")}` },
        { BASIC_AUTH_USERNAME: "cci", BASIC_AUTH_PASSWORD: "pass" }
      ),
      sqlUnused
    );
    expect(id.source).toBe("admin-key");
    expect(id.roles).toContain("system_admin");
  });

  it("Basic-only requests still resolve as viewer when admin key is missing", async () => {
    const id = await resolveIdentity(
      authCtx({ Authorization: `Basic ${btoa("cci:pass")}` }, { BASIC_AUTH_USERNAME: "cci", BASIC_AUTH_PASSWORD: "pass" }),
      sqlUnused
    );
    expect(id.source).toBe("basic-auth");
    expect(id.roles).toEqual(["viewer"]);
  });

  it("wrong admin key with Basic credentials falls back to Basic viewer (not anonymous)", async () => {
    const id = await resolveIdentity(
      authCtx(
        { "X-Admin-Key": "wrong-key", Authorization: `Basic ${btoa("cci:pass")}` },
        { BASIC_AUTH_USERNAME: "cci", BASIC_AUTH_PASSWORD: "pass" }
      ),
      sqlUnused
    );
    expect(id.source).toBe("basic-auth");
    expect(id.roles).toEqual(["viewer"]);
  });
});