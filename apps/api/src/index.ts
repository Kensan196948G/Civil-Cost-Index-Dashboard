import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "./types";
import {
  basicAuthMiddleware,
  corsMiddleware,
  fail,
  ok,
  requireAdmin,
  requestIdMiddleware,
  type AppContext,
} from "./lib/http";
import { getSql } from "./lib/db";
import { listRegions, listItems } from "./services/masters";
import { listDataSources, createDataSource, updateDataSource, dataSourceCreateSchema, dataSourcePatchSchema } from "./services/dataSources";
import { buildTimeseries, fetchRawRows, rawRowsToSeries } from "./services/timeseries";
import { listAlerts } from "./services/alerts";
import { getDashboardSummary } from "./services/dashboard";
import { listFetchJobs } from "./services/fetchJobs";
import { fetchFromUrl } from "./services/fetchUrl";
import { handleUpload } from "./services/uploads";
import { buildCsvExport } from "./services/exportCsv";
import { parsePeriod } from "./lib/stats";

const app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();

app.use("*", requestIdMiddleware);
app.use("*", basicAuthMiddleware);
app.use("*", corsMiddleware);

const CATEGORIES = ["MATERIAL_PRICE", "LABOR_COST", "PRICE_INDEX", "FUEL_PRICE", "OTHER"];

function parseCsvList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

function validatePeriod(value: string | undefined, name: string): string | null {
  if (value == null || value === "") return null;
  const parsed = parsePeriod(value);
  if (!parsed) {
    throw new Error(`${name} は YYYY-MM 形式で指定してください。`);
  }
  return parsed;
}

function errorStatus(e: unknown): number {
  const status = (e as Error & { status?: number }).status;
  return status ?? 500;
}

async function handleError(c: AppContext, e: unknown) {
  const status = errorStatus(e);
  if (status === 400) return fail(c, "VALIDATION_ERROR", (e as Error).message, 400);
  if (status === 401) return fail(c, "UNAUTHORIZED", "管理者キーが無効です。", 401);
  if (status === 404) return fail(c, "NOT_FOUND", (e as Error).message, 404);
  if (status === 409) return fail(c, "CONFLICT", (e as Error).message, 409);
  if (status === 501) return fail(c, "NOT_IMPLEMENTED", (e as Error).message, 501);
  if (status === 502) return fail(c, "BAD_GATEWAY", (e as Error).message, 502);
  console.error("internal_error", e);
  return fail(c, "INTERNAL_ERROR", "内部エラーが発生しました。", 500);
}

// Health
app.get("/api/health/live", (c) =>
  ok(c, {
    status: "ok",
    version: c.env.APP_VERSION ?? "unknown",
    admin_configured: Boolean(c.env.ADMIN_API_KEY),
  })
);

app.get("/api/health/ready", async (c) => {
  try {
    const sql = getSql(c.env);
    await sql`SELECT 1`;
    return ok(c, { status: "ok", database: "ok" });
  } catch (e) {
    console.error("ready_check_failed", e);
    return fail(c, "INTERNAL_ERROR", "データベース接続に失敗しました。", 503);
  }
});

// Masters
app.get("/api/regions", async (c) => {
  const sql = getSql(c.env);
  return ok(c, { regions: await listRegions(sql) });
});

app.get("/api/items", async (c) => {
  const category = c.req.query("category");
  if (category && !CATEGORIES.includes(category)) {
    return fail(c, "VALIDATION_ERROR", `category は ${CATEGORIES.join("/")} のいずれかを指定してください。`, 400);
  }
  const sql = getSql(c.env);
  return ok(c, { items: await listItems(sql, category) });
});

// Timeseries
const timeseriesQuerySchema = z.object({
  data_type: z.enum(CATEGORIES as [string, ...string[]]),
  item_ids: z.string().optional(),
  region_ids: z.string().optional(),
  start_period: z.string().optional(),
  end_period: z.string().optional(),
  normalize: z.string().optional(),
  base_period: z.string().optional(),
});

app.get("/api/timeseries", async (c) => {
  const q = c.req.query();
  const parsed = timeseriesQuerySchema.safeParse(q);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "パラメータが不正です。", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  try {
    const start = validatePeriod(parsed.data.start_period, "start_period");
    const end = validatePeriod(parsed.data.end_period, "end_period");
    const base = validatePeriod(parsed.data.base_period, "base_period");
    const sql = getSql(c.env);
    const result = await buildTimeseries(sql, {
      dataType: parsed.data.data_type,
      itemIds: parseCsvList(parsed.data.item_ids),
      regionIds: parseCsvList(parsed.data.region_ids),
      startPeriod: start,
      endPeriod: end,
      normalize: parseBool(parsed.data.normalize),
      basePeriod: base,
    });
    return ok(c, result);
  } catch (e) {
    return handleError(c, e);
  }
});

// Compare
app.get("/api/compare", async (c) => {
  const seriesParam = c.req.query("series") ?? "";
  const tokens = seriesParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return fail(c, "VALIDATION_ERROR", "series を指定してください（dataType:itemCode:regionCode のカンマ区切り）。", 400);
  }
  if (tokens.length > 10) {
    return fail(c, "VALIDATION_ERROR", "series は最大10件までです。", 400);
  }
  const parsedTokens: Array<{ dataType: string; itemCode: string; regionCode: string }> = [];
  for (const token of tokens) {
    const parts = token.split(":");
    if (parts.length !== 3 || !CATEGORIES.includes(parts[0]) || !parts[1] || !parts[2]) {
      return fail(c, "VALIDATION_ERROR", `series の形式が不正です: ${token}`, 400);
    }
    parsedTokens.push({ dataType: parts[0], itemCode: parts[1], regionCode: parts[2] });
  }
  try {
    const start = validatePeriod(c.req.query("start_period"), "start_period");
    const end = validatePeriod(c.req.query("end_period"), "end_period");
    const base = validatePeriod(c.req.query("base_period"), "base_period");
    const sql = getSql(c.env);
    const dataTypes = [...new Set(parsedTokens.map((t) => t.dataType))];
    const itemCodes = [...new Set(parsedTokens.map((t) => t.itemCode))];
    const regionCodes = [...new Set(parsedTokens.map((t) => t.regionCode))];
    const rows = await fetchRawRows(sql, {
      dataType: dataTypes[0],
      dataTypes,
      itemCodes,
      regionCodes,
      startPeriod: start,
      endPeriod: end,
      normalize: parseBool(c.req.query("normalize")),
      basePeriod: base,
    });
    return ok(c, {
      conditions: {
        data_type: dataTypes.join(","),
        start_period: start,
        end_period: end,
        normalize: parseBool(c.req.query("normalize")),
        base_period: base,
      },
      series: rawRowsToSeries(rows, { normalize: parseBool(c.req.query("normalize")), basePeriod: base }),
    });
  } catch (e) {
    return handleError(c, e);
  }
});

// Alerts
app.get("/api/alerts", async (c) => {
  const thresholdMom = Number(c.req.query("threshold_mom") ?? 5);
  const thresholdYoy = Number(c.req.query("threshold_yoy") ?? 10);
  const limit = Number(c.req.query("limit") ?? 20);
  if (![thresholdMom, thresholdYoy, limit].every(Number.isFinite) || limit < 1 || limit > 100) {
    return fail(c, "VALIDATION_ERROR", "threshold/limit の値が不正です。", 400);
  }
  const sql = getSql(c.env);
  return ok(c, { alerts: await listAlerts(sql, thresholdMom, thresholdYoy, Math.floor(limit)) });
});

// Dashboard summary
app.get("/api/dashboard/summary", async (c) => {
  try {
    const base = validatePeriod(c.req.query("base_period"), "base_period");
    const period = c.req.query("period");
    if (period && !["latest", "1y", "3y", "5y"].includes(period)) {
      return fail(c, "VALIDATION_ERROR", "period は latest / 1y / 3y / 5y のいずれかを指定してください。", 400);
    }
    const sql = getSql(c.env);
    const summary = await getDashboardSummary(sql, {
      regionId: c.req.query("region_id") ?? undefined,
      basePeriod: base,
      period: period ?? undefined,
    });
    return ok(c, summary);
  } catch (e) {
    return handleError(c, e);
  }
});

// Data sources
app.get("/api/data-sources", async (c) => {
  const sql = getSql(c.env);
  return ok(c, { data_sources: await listDataSources(sql) });
});

app.post("/api/data-sources", async (c) => {
  if (!requireAdmin(c)) return fail(c, "UNAUTHORIZED", "管理者キーが必要です。", 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, "VALIDATION_ERROR", "JSONボディが必要です。", 400);
  }
  const parsed = dataSourceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  try {
    const sql = getSql(c.env);
    const created = await createDataSource(sql, parsed.data);
    return ok(c, created, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.patch("/api/data-sources/:id", async (c) => {
  if (!requireAdmin(c)) return fail(c, "UNAUTHORIZED", "管理者キーが必要です。", 401);
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, "VALIDATION_ERROR", "JSONボディが必要です。", 400);
  }
  const parsed = dataSourcePatchSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  try {
    const sql = getSql(c.env);
    const updated = await updateDataSource(sql, id, parsed.data);
    if (!updated) return fail(c, "NOT_FOUND", "データソースが見つかりません。", 404);
    return ok(c, updated);
  } catch (e) {
    return handleError(c, e);
  }
});

// Fetch jobs
app.get("/api/fetch-jobs", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    return fail(c, "VALIDATION_ERROR", "limit は 1〜200 で指定してください。", 400);
  }
  try {
    const sql = getSql(c.env);
    return ok(c, { fetch_jobs: await listFetchJobs(sql, { status: c.req.query("status"), limit: Math.floor(limit) }) });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/fetch-jobs", async (c) => {
  if (!requireAdmin(c)) return fail(c, "UNAUTHORIZED", "管理者キーが必要です。", 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, "VALIDATION_ERROR", "JSONボディが必要です。", 400);
  }
  const parsed = z
    .object({
      data_source_id: z.string().min(1),
      url: z.string().optional().nullable(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  try {
    const sql = getSql(c.env);
    const result = await fetchFromUrl(sql, {
      dataSourceId: parsed.data.data_source_id,
      url: parsed.data.url ?? undefined,
    }, c.env);
    return ok(c, result, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

// Uploads
app.post("/api/uploads", async (c) => {
  if (!requireAdmin(c)) return fail(c, "UNAUTHORIZED", "管理者キーが必要です。", 401);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return fail(c, "VALIDATION_ERROR", "multipart/form-data が必要です。", 400);
  }
  const file = form.get("file");
  const dataSourceId = String(form.get("data_source_id") ?? "");
  if (!(file instanceof File)) {
    return fail(c, "VALIDATION_ERROR", "file フィールドが必要です。", 400);
  }
  if (!dataSourceId) {
    return fail(c, "VALIDATION_ERROR", "data_source_id が必要です。", 400);
  }
  try {
    const sql = getSql(c.env);
    const result = await handleUpload(sql, {
      fileName: file.name,
      buffer: await file.arrayBuffer(),
      dataSourceId,
    });
    return ok(c, result, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

// CSV export
app.get("/api/export/csv", async (c) => {
  const q = c.req.query();
  const parsed = timeseriesQuerySchema.safeParse(q);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "パラメータが不正です。", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  try {
    const start = validatePeriod(parsed.data.start_period, "start_period");
    const end = validatePeriod(parsed.data.end_period, "end_period");
    const base = validatePeriod(parsed.data.base_period, "base_period");
    const sql = getSql(c.env);
    const csv = await buildCsvExport(sql, {
      dataType: parsed.data.data_type,
      itemIds: parseCsvList(parsed.data.item_ids),
      regionIds: parseCsvList(parsed.data.region_ids),
      startPeriod: start,
      endPeriod: end,
      normalize: parseBool(parsed.data.normalize),
      basePeriod: base,
    });
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cci-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
  } catch (e) {
    return handleError(c, e);
  }
});

// Report (optional; returns 501 when PDF library is unavailable)
app.post("/api/export/report", (c) => {
  return fail(c, "NOT_IMPLEMENTED", "PDFレポート生成は未実装です。", 501);
});

app.notFound((c) => fail(c, "NOT_FOUND", "エンドポイントが見つかりません。", 404));

export default app;
