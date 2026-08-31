import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestIdMiddleware, requestLogMiddleware } from "../src/lib/http";
import type { Env } from "../src/types";

function makeApp() {
  const app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();
  app.use("*", requestIdMiddleware);
  app.use("*", requestLogMiddleware);
  app.get("/items", (c) => c.json({ ok: true }, 201));
  app.get("/error", () => {
    throw new Error("test error");
  });
  return app;
}

afterEach(() => vi.restoreAllMocks());

describe("requestLogMiddleware", () => {
  it("logs structured completion data without the query string", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const app = makeApp();
    await app.fetch(new Request("http://localhost/items?token=secret"), {
      REQUEST_LOGGING: "true",
    } as Env);

    expect(log).toHaveBeenCalledOnce();
    const entry = JSON.parse(String(log.mock.calls[0][0]));
    expect(entry).toMatchObject({ event: "http_request", method: "GET", path: "/items", status: 201 });
    expect(entry.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
    expect(log.mock.calls[0][0]).not.toContain("secret");
  });

  it("is disabled unless explicitly enabled", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await makeApp().fetch(new Request("http://localhost/items"), {} as Env);
    expect(log).not.toHaveBeenCalled();
  });

  it("records responses produced by the error handler", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await makeApp().fetch(new Request("http://localhost/error"), {
      REQUEST_LOGGING: "true",
    } as Env);

    expect(response.status).toBe(500);
    const entry = JSON.parse(String(log.mock.calls[0][0]));
    expect(entry.status).toBe(500);
  });
});
