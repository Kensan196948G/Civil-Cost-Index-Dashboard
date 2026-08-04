import { describe, expect, it } from "vitest";
import { hasRole, type Identity } from "../src/lib/auth";

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
