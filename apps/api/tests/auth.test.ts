import { describe, expect, it } from "vitest";
import { hasRole, requireRole, resolveIdentity, type AuthContext, type Identity } from "../src/lib/auth";
import type { Env } from "../src/types";
import type { Sql } from "../src/lib/db";

const baseEnv: Env = {
  DATABASE_URL: "postgres://dummy",
  ADMIN_API_KEY: "admin-key",
  CORS_ORIGINS: "*",
  APP_VERSION: "test",
};

// 匿名フォールバックのテストではDBが呼ばれない（admin-key / JWT / 信頼ヘッダーが全て無いため）
const sqlUnused: Sql = async () => [];

function makeCtx(overrides: Partial<Env> = {}, headers: Record<string, string> = {}): AuthContext {
  return {
    req: { header: (name: string) => headers[name] },
    env: { ...baseEnv, ...overrides },
  };
}

const admin: Identity = {
  email: "admin-key",
  display_name: null,
  roles: ["system_admin", "auditor", "data_approver", "estimating_manager", "data_ingester", "estimator", "viewer"],
  source: "admin-key",
};

const estimator: Identity = {
  email: "taro@example.com",
  display_name: "太郎",
  roles: ["estimator", "viewer"],
  source: "access-jwt",
};

const viewer: Identity = {
  email: "viewer@example.com",
  display_name: null,
  roles: ["viewer"],
  source: "access-jwt",
};

describe("hasRole", () => {
  it("admin has any role", () => {
    for (const role of ["viewer", "data_ingester", "data_approver", "estimator", "estimating_manager", "auditor", "system_admin"]) {
      expect(hasRole(admin, [role])).toBe(true);
    }
  });

  it("estimator cannot approve prices", () => {
    expect(hasRole(estimator, ["data_approver"])).toBe(false);
    expect(hasRole(estimator, ["estimator"])).toBe(true);
  });

  it("viewer has no mutation roles", () => {
    expect(hasRole(viewer, ["data_ingester"])).toBe(false);
    expect(hasRole(viewer, ["viewer"])).toBe(true);
  });
});

describe("resolveIdentity - anonymous boundary", () => {
  it("default: anonymous has no roles, requireRole returns 401", async () => {
    const identity = await resolveIdentity(makeCtx(), sqlUnused);
    expect(identity.source).toBe("anonymous");
    expect(identity.roles).toEqual([]);
    expect(hasRole(identity, ["viewer"])).toBe(false);
    await expect(requireRole(makeCtx(), sqlUnused, ["viewer"])).rejects.toMatchObject({ status: 401 });
  });

  it("ALLOW_ANONYMOUS_VIEWER=true: anonymous is granted viewer (demo only)", async () => {
    const identity = await resolveIdentity(makeCtx({ ALLOW_ANONYMOUS_VIEWER: "true" }), sqlUnused);
    expect(identity.source).toBe("anonymous");
    expect(hasRole(identity, ["viewer"])).toBe(true);
    const passed = await requireRole(makeCtx({ ALLOW_ANONYMOUS_VIEWER: "true" }), sqlUnused, ["viewer"]);
    expect(passed.source).toBe("anonymous");
  });

  it("trusted header path is not affected by the anonymous boundary", async () => {
    const identity = await resolveIdentity(
      makeCtx({ AUTH_TRUST_PROXY: "true" }, { "X-User-Email": "hanako@example.com", "X-User-Roles": "estimator,viewer" }),
      sqlUnused
    );
    expect(identity.source).toBe("trusted-header");
    expect(identity.roles).toContain("estimator");
  });

  it("basic auth grants viewer without DB (LAN gate)", async () => {
    const header = `Basic ${btoa("cci:secret-pass")}`;
    const identity = await resolveIdentity(
      makeCtx({ BASIC_AUTH_USERNAME: "cci", BASIC_AUTH_PASSWORD: "secret-pass" }, { Authorization: header }),
      sqlUnused
    );
    expect(identity.source).toBe("basic-auth");
    expect(hasRole(identity, ["viewer"])).toBe(true);
    expect(hasRole(identity, ["system_admin"])).toBe(false);
  });

  it("invalid basic credentials fall through to anonymous rejection", async () => {
    const header = `Basic ${btoa("cci:wrong-pass")}`;
    const identity = await resolveIdentity(
      makeCtx({ BASIC_AUTH_USERNAME: "cci", BASIC_AUTH_PASSWORD: "secret-pass" }, { Authorization: header }),
      sqlUnused
    );
    expect(identity.source).toBe("anonymous");
    await expect(
      requireRole(makeCtx({ BASIC_AUTH_USERNAME: "cci", BASIC_AUTH_PASSWORD: "secret-pass" }, { Authorization: header }), sqlUnused, ["viewer"])
    ).rejects.toMatchObject({ status: 401 });
  });
});
