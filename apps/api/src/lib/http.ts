import { Context, Next } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "../types";

export type AppContext = Context<{
  Bindings: Env;
  Variables: { requestId: string };
}>;

export type ErrorBody = {
  code: string;
  message: string;
  details?: unknown[];
};

export function ok<T>(c: AppContext, data: T, status: ContentfulStatusCode = 200) {
  return c.json(
    {
      success: true,
      data,
      meta: {
        request_id: c.get("requestId"),
        generated_at: new Date().toISOString(),
      },
    },
    status
  );
}

export function fail(
  c: AppContext,
  code: string,
  message: string,
  status: ContentfulStatusCode = 400,
  details: unknown[] = []
) {
  return c.json(
    {
      success: false,
      error: { code, message, ...(details.length ? { details } : {}) },
      meta: { request_id: c.get("requestId") },
    },
    status
  );
}

export async function requestIdMiddleware(c: AppContext, next: Next) {
  c.set("requestId", crypto.randomUUID());
  await next();
}

export async function requestLogMiddleware(c: AppContext, next: Next) {
  const startedAt = performance.now();
  await next();
  if (c.env.REQUEST_LOGGING !== "true") return;
  console.log(JSON.stringify({
    event: "http_request",
    request_id: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
  }));
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export async function securityHeadersMiddleware(c: AppContext, next: Next): Promise<Response | void> {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
}

export async function rateLimitMiddleware(c: AppContext, next: Next): Promise<Response | void> {
  if (c.req.method === "OPTIONS" || c.req.path.startsWith("/api/health/")) return next();
  const limit = Number(c.env.RATE_LIMIT_PER_MINUTE || "180");
  if (!Number.isFinite(limit) || limit <= 0) return next();

  const now = Date.now();
  const forwarded = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "";
  const key = forwarded.split(",")[0].trim() || "local";
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  current.count += 1;
  if (current.count > limit) {
    c.header("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
    return fail(c, "RATE_LIMITED", "短時間のリクエスト数が上限を超えました。時間を置いて再試行してください。", 429);
  }
  return next();
}

export async function basicAuthMiddleware(c: AppContext, next: Next): Promise<Response | void> {
  // 死活監視用ヘルスチェックは認証対象外（ヘルスチェックは資格情報を送信できないため）
  if (c.req.path.startsWith("/api/health/")) return next();
  const user = (c.env.BASIC_AUTH_USERNAME || "").trim();
  const pass = (c.env.BASIC_AUTH_PASSWORD || "").trim();
  if (!user && !pass) return next();

  const header = c.req.header("Authorization") || "";
  const expected = "Basic " + btoa(`${user}:${pass}`);
  if (header !== expected) {
    c.header("WWW-Authenticate", 'Basic realm="cci", charset="UTF-8"');
    return fail(c, "UNAUTHORIZED", "Basic認証が必要です。", 401);
  }
  return next();
}

export async function corsMiddleware(c: AppContext, next: Next): Promise<Response | void> {
  const origin = c.req.header("Origin");
  const allowed = (c.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowAll = allowed.includes("*");
  if (origin && (allowed.includes(origin) || allowAll)) {
    c.header("Access-Control-Allow-Origin", allowAll ? "*" : origin);
    if (!allowAll) c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
    c.header("Access-Control-Max-Age", "86400");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  return next();
}

export function requireAdmin(c: AppContext) {
  const configured = (c.env.ADMIN_API_KEY || "").trim();
  if (!configured) return true;
  const provided = c.req.header("X-Admin-Key") || "";
  return provided === configured;
}

export function toErrorBody(e: unknown): ErrorBody {
  if (e instanceof Error) {
    return { code: "INTERNAL_ERROR", message: e.message || "内部エラーが発生しました。" };
  }
  return { code: "INTERNAL_ERROR", message: "内部エラーが発生しました。" };
}
