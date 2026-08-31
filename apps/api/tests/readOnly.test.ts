import { describe, expect, it, vi } from "vitest";
import app, { scheduled } from "../src/index";
import type { Env } from "../src/types";

const env: Env = {
  DATABASE_URL: "postgresql://unused",
  ADMIN_API_KEY: "admin-key",
  CORS_ORIGINS: "http://localhost:3000",
  APP_VERSION: "test",
  READ_ONLY_MODE: "true",
};

describe("read-only compatibility route", () => {
  it("allows health reads", async () => {
    const response = await app.fetch(new Request("http://localhost/api/health/live"), env);
    expect(response.status).toBe(200);
  });

  it("rejects writes before database access", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      env
    );
    const body = await response.json() as { error: { code: string } };
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("READ_ONLY_MODE");
  });

  it("does not run scheduled writes", async () => {
    const waitUntil = vi.fn();
    await scheduled({} as ScheduledEvent, env, { waitUntil } as unknown as ExecutionContext);
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
