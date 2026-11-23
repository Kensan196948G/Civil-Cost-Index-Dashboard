import { describe, expect, it } from "vitest";
import { isLocalPgUrl } from "../src/lib/db";

describe("isLocalPgUrl", () => {
  it("accepts local TCP URLs with sslmode=disable", () => {
    expect(isLocalPgUrl("postgresql://cci@127.0.0.1:5432/cci_test?sslmode=disable")).toBe(true);
    expect(isLocalPgUrl("postgresql://cci@localhost:5432/cci_test")).toBe(true);
  });

  it("accepts local TCP URLs by host", () => {
    expect(isLocalPgUrl("postgresql://cci@127.0.0.1:5432/cci_test")).toBe(true);
    expect(isLocalPgUrl("postgresql://cci@[::1]:5432/cci_test")).toBe(true);
  });

  it("accepts Unix socket URLs that new URL() cannot parse directly", () => {
    expect(isLocalPgUrl("postgresql://kensan@/cci_staging?host=/var/run/postgresql&sslmode=disable")).toBe(true);
    expect(isLocalPgUrl("postgresql:///cci_staging?host=/var/run/postgresql")).toBe(true);
  });

  it("rejects remote databases", () => {
    expect(isLocalPgUrl("postgresql://user:pass@db.example.com:5432/app?sslmode=require")).toBe(false);
    expect(isLocalPgUrl("postgresql://user@ep-cool-123.ap-southeast-1.aws.neon.tech/neondb")).toBe(false);
  });

  it("rejects invalid connection strings", () => {
    expect(isLocalPgUrl("not-a-url")).toBe(false);
    expect(isLocalPgUrl("")).toBe(false);
  });
});
