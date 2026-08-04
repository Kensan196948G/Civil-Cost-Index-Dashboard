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
import { requireRole, resolveIdentity, ALL_ROLES, ROLE_LABELS } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { listRegions, listItems } from "./services/masters";
import { listDataSources, createDataSource, updateDataSource, dataSourceCreateSchema, dataSourcePatchSchema } from "./services/dataSources";
import { buildTimeseries, fetchRawRows, rawRowsToSeries } from "./services/timeseries";
import { listAlerts } from "./services/alerts";
import { getDashboardSummary } from "./services/dashboard";
import { listFetchJobs } from "./services/fetchJobs";
import { fetchFromUrl } from "./services/fetchUrl";
import { handleUpload } from "./services/uploads";
import { buildCsvExport } from "./services/exportCsv";
import { buildXlsxExport } from "./services/exportXlsx";
import { buildEstimateLinkXlsx } from "./services/exportEstimateLink";
import { buildPptxExport } from "./services/exportPptx";
import { buildPdfExport, getCjkFontBytes } from "./services/exportPdf";
import { buildEstimateXlsx } from "./services/exportEstimateXlsx";
import { buildEstimatePdf } from "./services/exportEstimatePdf";
import { parsePeriod } from "./lib/stats";
import { getAiProviderInfo, getAvailableProviders } from "./lib/ai";
import { buildMarketSummary, type Audience } from "./services/aiSummary";
import { explainAlerts } from "./services/aiAlerts";
import { generateReport, REPORT_TYPE_LABELS, type ReportType } from "./services/aiReport";
import { runQualityChecks } from "./services/aiQuality";
import { AI_TEMPLATES } from "./services/aiTemplates";
import { listAiAudit, submitAiFeedback } from "./services/aiAudit";
import { listUsers, createUser, updateUser, deleteUser } from "./services/users";
import { listOperationAudit } from "./services/opsAudit";
import {
  listPriceVersions,
  createPriceVersion,
  updatePriceVersion,
  approvePriceVersion,
  retirePriceVersion,
  comparePriceVersions,
  getPriceVersion,
  deletePriceVersion,
  deleteSnapshot,
  createSnapshot,
  listSnapshots,
  getSnapshot,
  priceVersionSchema,
  priceVersionPatchSchema,
  snapshotSchema,
} from "./services/priceVersions";
import {
  listSchedules,
  createSchedule,
  updateSchedule,
  runSchedule,
  listStaged,
  approveStaged,
  rejectStaged,
  deleteSchedule,
  deleteStaged,
  scheduleSchema,
  schedulePatchSchema,
} from "./services/schedules";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  addProjectItem,
  updateProjectItem,
  deleteProjectItem,
  simulateProject,
  projectSchema,
  projectPatchSchema,
  projectItemSchema,
  projectItemPatchSchema,
  simulationSchema,
} from "./services/projects";
import {
  listVessels,
  listWorkTypes,
  estimatePort,
  importVessels,
  listSeaConditions,
  upsertSeaCondition,
  computeWorkability,
  listSoilTypes,
  upsertSoilType,
  listTransportRates,
  upsertTransportRate,
  listSpoilGrounds,
  upsertSpoilGround,
  listShiftRules,
  upsertShiftRule,
  portEstimateSchema,
  seaConditionSchema,
  soilTypeSchema,
  transportRateSchema,
  spoilGroundSchema,
  shiftRuleSchema,
} from "./services/portModels";
import {
  listEstimationBases,
  createEstimationBase,
  updateEstimationBase,
  upsertOverheadRate,
  importOverheadRates,
  listTrees,
  createTree,
  listBreakdowns,
  createBreakdown,
  updateBreakdown,
  importBreakdowns,
  listQuantities,
  addQuantity,
  updateQuantity,
  deleteQuantity,
  calculateEstimate,
  listEstimates,
  getEstimate,
  deleteEstimate,
  aiSuggestBreakdowns,
  estimationBaseSchema,
  treeSchema,
  breakdownSchema,
  rateSchema,
  quantitySchema,
} from "./services/estimating";
import { parseCsv, parseWorkbookRows } from "./lib/csv";
import { decodeBuffer } from "./lib/decode";
import {
  createChangeOrder,
  listChangeOrders,
  getChangeOrder,
  addChangeOrderLine,
  deleteChangeOrderLine,
  deleteChangeOrder,
  buildChangeOrderXlsx,
  changeOrderSchema,
  changeLineSchema,
} from "./services/changeOrders";
import { runScheduledJobs } from "./lib/scheduler";

const app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

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
  if (status === 403) return fail(c, "FORBIDDEN", (e as Error).message, 403);
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

// Excel export (出典・データ種別・積算利用可否を含む3シート構成)
app.get("/api/export/xlsx", async (c) => {
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
    const buffer = await buildXlsxExport(sql, {
      dataType: parsed.data.data_type,
      itemIds: parseCsvList(parsed.data.item_ids),
      regionIds: parseCsvList(parsed.data.region_ids),
      startPeriod: start,
      endPeriod: end,
      normalize: parseBool(parsed.data.normalize),
      basePeriod: base,
    });
    return c.body(buffer, 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cci-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    });
  } catch (e) {
    return handleError(c, e);
  }
});

// Excel: 積算連携（単価候補・根拠・改定差分・スナップショット受け渡し）
app.get("/api/export/estimate-link", async (c) => {
  try {
    const sql = getSql(c.env);
    const buffer = await buildEstimateLinkXlsx(sql, { snapshot_id: c.req.query("snapshot_id") ?? null });
    return c.body(buffer, 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cci-estimate-link-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    });
  } catch (e) {
    return handleError(c, e);
  }
});

// PowerPoint出力（概要＋系列ごとスライド）
app.get("/api/export/pptx", async (c) => {
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
    const buffer = await buildPptxExport(sql, {
      dataType: parsed.data.data_type,
      itemIds: parseCsvList(parsed.data.item_ids),
      regionIds: parseCsvList(parsed.data.region_ids),
      startPeriod: start,
      endPeriod: end,
      normalize: parseBool(parsed.data.normalize),
      basePeriod: base,
    });
    return c.body(toArrayBuffer(buffer), 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="cci-report-${new Date().toISOString().slice(0, 10)}.pptx"`,
    });
  } catch (e) {
    return handleError(c, e);
  }
});

// PDF出力（日本語フォント埋め込み）
app.get("/api/export/pdf", async (c) => {
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
    const fontBytes = await getCjkFontBytes(c.env);
    const buffer = await buildPdfExport(
      sql,
      {
        dataType: parsed.data.data_type,
        itemIds: parseCsvList(parsed.data.item_ids),
        regionIds: parseCsvList(parsed.data.region_ids),
        startPeriod: start,
        endPeriod: end,
        normalize: parseBool(parsed.data.normalize),
        basePeriod: base,
      },
      fontBytes
    );
    return c.body(toArrayBuffer(buffer), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cci-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
    });
  } catch (e) {
    return handleError(c, e);
  }
});

// ---- 認証・ユーザー・監査（RBAC / Cloudflare Access連携） ----

app.get("/api/auth/me", async (c) => {
  const sql = getSql(c.env);
  const identity = await resolveIdentity(c, sql);
  return ok(c, {
    email: identity.email,
    display_name: identity.display_name,
    roles: identity.roles,
    role_labels: identity.roles.map((r) => ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r),
    source: identity.source,
    authenticated: identity.source !== "anonymous",
  });
});

const userRolesSchema = z.object({
  email: z.string().min(1).max(320),
  display_name: z.string().max(200).optional().nullable(),
  roles: z.array(z.enum(ALL_ROLES)).optional(),
});

app.get("/api/users", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["system_admin"]);
  return ok(c, { users: await listUsers(sql) });
});

app.post("/api/users", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["system_admin"]);
  const parsed = userRolesSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const user = await createUser(sql, parsed.data, identity);
    await recordAudit(sql, identity, "user.create", "user", String(user.id), { email: user.email });
    return ok(c, { user }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

const userPatchSchema = userRolesSchema.partial();

app.patch("/api/users/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["system_admin"]);
  const parsed = userPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const user = await updateUser(sql, c.req.param("id"), parsed.data, identity);
    if (!user) return fail(c, "NOT_FOUND", "ユーザーが見つかりません。", 404);
    await recordAudit(sql, identity, "user.update", "user", String(user.id), { email: user.email });
    return ok(c, { user });
  } catch (e) {
    return handleError(c, e);
  }
});

app.delete("/api/users/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["system_admin"]);
  try {
    const id = await deleteUser(sql, c.req.param("id"));
    if (!id) return fail(c, "NOT_FOUND", "ユーザーが見つかりません。", 404);
    await recordAudit(sql, identity, "user.delete", "user", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/audit/operations", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["auditor", "system_admin"]);
  const limit = Number(c.req.query("limit") ?? 100);
  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return fail(c, "VALIDATION_ERROR", "limit は 1〜500 で指定してください。", 400);
  }
  return ok(c, {
    logs: await listOperationAudit(sql, {
      actor: c.req.query("actor") ?? undefined,
      action: c.req.query("action") ?? undefined,
      limit: Math.floor(limit),
    }),
  });
});

// ---- 単価版管理・スナップショット ----

const PRICE_EDIT_ROLES = ["data_ingester", "data_approver", "estimator", "estimating_manager", "system_admin"];
const PRICE_APPROVE_ROLES = ["data_approver", "estimating_manager", "system_admin"];

app.get("/api/price-versions", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  const versions = await listPriceVersions(sql, {
    item_id: c.req.query("item_id") ?? undefined,
    region_id: c.req.query("region_id") ?? undefined,
    status: c.req.query("status") ?? undefined,
    limit: Number(c.req.query("limit") ?? 100),
  });
  return ok(c, { price_versions: versions });
});

app.post("/api/price-versions", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PRICE_EDIT_ROLES);
  const parsed = priceVersionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await createPriceVersion(sql, parsed.data, identity);
    const version = await getPriceVersion(sql, id);
    await recordAudit(sql, identity, "price_version.create", "price_version", String(id), { item_id: parsed.data.item_id, value: parsed.data.value });
    return ok(c, { price_version: version }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.patch("/api/price-versions/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PRICE_EDIT_ROLES);
  const parsed = priceVersionPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const version = await updatePriceVersion(sql, c.req.param("id"), parsed.data, identity);
    if (!version) return fail(c, "NOT_FOUND", "単価版が見つかりません。", 404);
    await recordAudit(sql, identity, "price_version.update", "price_version", String(version.id));
    return ok(c, { price_version: version });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/price-versions/:id/approve", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PRICE_APPROVE_ROLES);
  try {
    const version = await approvePriceVersion(sql, c.req.param("id"), identity);
    if (!version) return fail(c, "NOT_FOUND", "単価版が見つかりません。", 404);
    await recordAudit(sql, identity, "price_version.approve", "price_version", String(version.id), { value: version.value });
    return ok(c, { price_version: version });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/price-versions/:id/retire", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PRICE_APPROVE_ROLES);
  try {
    const version = await retirePriceVersion(sql, c.req.param("id"));
    if (!version) return fail(c, "NOT_FOUND", "単価版が見つかりません。", 404);
    await recordAudit(sql, identity, "price_version.retire", "price_version", String(version.id));
    return ok(c, { price_version: version });
  } catch (e) {
    return handleError(c, e);
  }
});

app.delete("/api/price-versions/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["estimating_manager", "system_admin"]);
  try {
    const id = await deletePriceVersion(sql, c.req.param("id"));
    if (!id) return fail(c, "NOT_FOUND", "単価版が見つかりません。", 404);
    await recordAudit(sql, identity, "price_version.delete", "price_version", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/price-versions/:id/compare", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  try {
    const result = await comparePriceVersions(sql, c.req.param("id"), c.req.query("old_id") ?? null);
    if (!result) return fail(c, "NOT_FOUND", "単価版が見つかりません。", 404);
    return ok(c, { comparison: result });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/price-snapshots", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { snapshots: await listSnapshots(sql) });
});

app.post("/api/price-snapshots", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["estimator", "estimating_manager", "system_admin"]);
  const parsed = snapshotSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const snapshot = await createSnapshot(sql, parsed.data, identity);
    if (!snapshot) return fail(c, "INTERNAL_ERROR", "スナップショットの作成に失敗しました。", 500);
    await recordAudit(sql, identity, "price_snapshot.create", "price_snapshot", String(snapshot.id), { name: snapshot.name });
    return ok(c, { snapshot }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/price-snapshots/:id", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  const snapshot = await getSnapshot(sql, c.req.param("id"));
  if (!snapshot) return fail(c, "NOT_FOUND", "スナップショットが見つかりません。", 404);
  return ok(c, { snapshot });
});

app.delete("/api/price-snapshots/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["estimating_manager", "system_admin"]);
  try {
    const id = await deleteSnapshot(sql, c.req.param("id"));
    if (!id) return fail(c, "NOT_FOUND", "スナップショットが見つかりません。", 404);
    await recordAudit(sql, identity, "price_snapshot.delete", "price_snapshot", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

// ---- 定期取得・承認待ち・通知 ----

app.get("/api/fetch-schedules", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["data_ingester", "data_approver", "system_admin"]);
  return ok(c, { schedules: await listSchedules(sql) });
});

app.post("/api/fetch-schedules", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["data_ingester", "system_admin"]);
  const parsed = scheduleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await createSchedule(sql, parsed.data, identity);
    await recordAudit(sql, identity, "fetch_schedule.create", "fetch_schedule", String(id), parsed.data);
    return ok(c, { schedule_id: id }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.patch("/api/fetch-schedules/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["data_ingester", "system_admin"]);
  const parsed = schedulePatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await updateSchedule(sql, c.req.param("id"), parsed.data);
    if (!id) return fail(c, "NOT_FOUND", "スケジュールが見つかりません。", 404);
    await recordAudit(sql, identity, "fetch_schedule.update", "fetch_schedule", String(id));
    return ok(c, { schedule_id: id });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/fetch-schedules/:id/run", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["data_ingester", "system_admin"]);
  try {
    const result = await runSchedule(sql, c.env, c.req.param("id"), identity);
    await recordAudit(sql, identity, "fetch_schedule.run", "fetch_schedule", c.req.param("id"), result);
    return ok(c, { result });
  } catch (e) {
    return handleError(c, e);
  }
});

app.delete("/api/fetch-schedules/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["data_ingester", "system_admin"]);
  try {
    const id = await deleteSchedule(sql, c.req.param("id"));
    if (!id) return fail(c, "NOT_FOUND", "スケジュールが見つかりません。", 404);
    await recordAudit(sql, identity, "fetch_schedule.delete", "fetch_schedule", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/staged-ingestions", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["data_approver", "estimating_manager", "system_admin"]);
  const status = c.req.query("status") ?? undefined;
  if (status && !["pending", "approved", "rejected"].includes(status)) {
    return fail(c, "VALIDATION_ERROR", "status は pending/approved/rejected のいずれかです。", 400);
  }
  return ok(c, { staged: await listStaged(sql, status) });
});

app.post("/api/staged-ingestions/:id/approve", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["data_approver", "estimating_manager", "system_admin"]);
  try {
    const result = await approveStaged(sql, c.req.param("id"), identity);
    if (!result) return fail(c, "NOT_FOUND", "承認待ちデータが見つからないか、既に処理済みです。", 404);
    await recordAudit(sql, identity, "staged.approve", "staged_ingestion", String(result.staged_id), { status: result.status, rows: result.success_rows });
    return ok(c, { result });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/staged-ingestions/:id/reject", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["data_approver", "estimating_manager", "system_admin"]);
  try {
    const id = await rejectStaged(sql, c.req.param("id"), identity);
    if (!id) return fail(c, "NOT_FOUND", "承認待ちデータが見つからないか、既に処理済みです。", 404);
    await recordAudit(sql, identity, "staged.reject", "staged_ingestion", String(id));
    return ok(c, { rejected: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.delete("/api/staged-ingestions/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ["data_approver", "system_admin"]);
  try {
    const id = await deleteStaged(sql, c.req.param("id"));
    if (!id) return fail(c, "NOT_FOUND", "承認待ちデータが見つかりません。", 404);
    await recordAudit(sql, identity, "staged.delete", "staged_ingestion", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

// ---- 案件影響分析（Phase 2） ----

const PROJECT_EDIT_ROLES = ["estimator", "estimating_manager", "system_admin"];

app.get("/api/projects", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { projects: await listProjects(sql) });
});

app.post("/api/projects", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PROJECT_EDIT_ROLES);
  const parsed = projectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const project = await createProject(sql, parsed.data, identity);
    await recordAudit(sql, identity, "project.create", "project", String(project.id), { name: project.name });
    return ok(c, { project }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/projects/:id", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  const project = await getProject(sql, c.req.param("id"));
  if (!project) return fail(c, "NOT_FOUND", "案件が見つかりません。", 404);
  return ok(c, { project });
});

app.patch("/api/projects/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PROJECT_EDIT_ROLES);
  const parsed = projectPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const project = await updateProject(sql, c.req.param("id"), parsed.data);
    if (!project) return fail(c, "NOT_FOUND", "案件が見つかりません。", 404);
    await recordAudit(sql, identity, "project.update", "project", String(project.id));
    return ok(c, { project });
  } catch (e) {
    return handleError(c, e);
  }
});

app.delete("/api/projects/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PROJECT_EDIT_ROLES);
  try {
    const id = await deleteProject(sql, c.req.param("id"));
    if (!id) return fail(c, "NOT_FOUND", "案件が見つかりません。", 404);
    await recordAudit(sql, identity, "project.delete", "project", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/projects/:id/items", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PROJECT_EDIT_ROLES);
  const parsed = projectItemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await addProjectItem(sql, c.req.param("id"), parsed.data);
    await recordAudit(sql, identity, "project_item.create", "project_item", String(id), parsed.data);
    return ok(c, { item_id: id }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.patch("/api/projects/:id/items/:itemId", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PROJECT_EDIT_ROLES);
  const parsed = projectItemPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await updateProjectItem(sql, c.req.param("id"), c.req.param("itemId"), parsed.data);
    if (!id) return fail(c, "NOT_FOUND", "案件明細が見つかりません。", 404);
    await recordAudit(sql, identity, "project_item.update", "project_item", String(id));
    return ok(c, { item_id: id });
  } catch (e) {
    return handleError(c, e);
  }
});

app.delete("/api/projects/:id/items/:itemId", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, PROJECT_EDIT_ROLES);
  try {
    const id = await deleteProjectItem(sql, c.req.param("id"), c.req.param("itemId"));
    if (!id) return fail(c, "NOT_FOUND", "案件明細が見つかりません。", 404);
    await recordAudit(sql, identity, "project_item.delete", "project_item", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/projects/:id/simulate", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  const parsed = simulationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const result = await simulateProject(sql, c.req.param("id"), parsed.data);
    if (!result) return fail(c, "NOT_FOUND", "案件が見つかりません。", 404);
    return ok(c, { simulation: result });
  } catch (e) {
    return handleError(c, e);
  }
});

// ---- 港湾工事コストモデル（PoC） ----

app.get("/api/port-models/vessels", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { vessels: await listVessels(sql) });
});

app.get("/api/port-models/work-types", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { work_types: await listWorkTypes(sql) });
});

app.post("/api/port-models/estimate", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  const parsed = portEstimateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const result = await estimatePort(sql, parsed.data);
    return ok(c, { estimate: result });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/vessels/import", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail(c, "VALIDATION_ERROR", "multipart/form-data が必要です。", 400);
  const file = form.get("file");
  if (!(file instanceof File)) return fail(c, "VALIDATION_ERROR", "file が必要です。", 400);
  try {
    const buffer = await file.arrayBuffer();
    const fileName = file.name.toLowerCase();
    const rows = fileName.endsWith(".xlsx")
      ? parseWorkbookRows(buffer)
      : parseCsv(decodeBuffer(buffer));
    const result = await importVessels(sql, { rows });
    await recordAudit(sql, identity, "vessel.import", "vessel", "", { imported: result.imported, errors: result.errors.length });
    return ok(c, { result });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/port-models/sea-conditions", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { sea_conditions: await listSeaConditions(sql, c.req.query("sea_area_code") ?? undefined) });
});

app.post("/api/port-models/sea-conditions", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = seaConditionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await upsertSeaCondition(sql, parsed.data);
    await recordAudit(sql, identity, "sea_condition.upsert", "sea_condition", String(id), { sea_area_code: parsed.data.sea_area_code, month: parsed.data.target_month });
    return ok(c, { sea_condition_id: id });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/port-models/workability", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  const parsed = z
    .object({
      sea_area_code: z.string().min(1),
      target_month: z.number().int().min(1).max(12),
      wave_height: z.number().min(0).optional().nullable(),
      wind_speed: z.number().min(0).optional().nullable(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const result = await computeWorkability(sql, parsed.data);
    return ok(c, { workability: result });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/port-models/soil-types", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { soil_types: await listSoilTypes(sql) });
});

app.post("/api/port-models/soil-types", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = soilTypeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  const id = await upsertSoilType(sql, parsed.data);
  await recordAudit(sql, identity, "soil_type.upsert", "soil_type", String(id));
  return ok(c, { soil_type_id: id });
});

app.get("/api/port-models/transport-rates", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { transport_rates: await listTransportRates(sql) });
});

app.post("/api/port-models/transport-rates", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = transportRateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  const id = await upsertTransportRate(sql, parsed.data);
  await recordAudit(sql, identity, "transport_rate.upsert", "transport_rate", String(id));
  return ok(c, { transport_rate_id: id });
});

app.get("/api/port-models/spoil-grounds", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { spoil_grounds: await listSpoilGrounds(sql) });
});

app.post("/api/port-models/spoil-grounds", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = spoilGroundSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  const id = await upsertSpoilGround(sql, parsed.data);
  await recordAudit(sql, identity, "spoil_ground.upsert", "spoil_ground", String(id));
  return ok(c, { spoil_ground_id: id });
});

app.get("/api/port-models/shift-rules", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { shift_rules: await listShiftRules(sql) });
});

app.post("/api/port-models/shift-rules", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = shiftRuleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  const id = await upsertShiftRule(sql, parsed.data);
  await recordAudit(sql, identity, "shift_rule.upsert", "shift_rule", String(id));
  return ok(c, { shift_rule_id: id });
});

// ---- 積算エンジン（Phase 4） ----

const ESTIMATE_WRITE_ROLES = ["data_ingester", "data_approver", "estimator", "estimating_manager", "system_admin"];

app.get("/api/estimation-bases", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { estimation_bases: await listEstimationBases(sql) });
});

app.post("/api/estimation-bases", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = estimationBaseSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await createEstimationBase(sql, parsed.data, identity);
    await recordAudit(sql, identity, "estimation_base.create", "estimation_base", String(id));
    return ok(c, { estimation_base_id: id }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.patch("/api/estimation-bases/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = estimationBaseSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await updateEstimationBase(sql, c.req.param("id"), parsed.data);
    if (!id) return fail(c, "NOT_FOUND", "積算基準が見つかりません。", 404);
    await recordAudit(sql, identity, "estimation_base.update", "estimation_base", String(id));
    return ok(c, { estimation_base_id: id });
  } catch (e) {
    return handleError(c, e);
  }
});

app.put("/api/estimation-bases/:id/rates/:rateType", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = rateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await upsertOverheadRate(sql, c.req.param("id"), c.req.param("rateType"), parsed.data);
    await recordAudit(sql, identity, "overhead_rate.upsert", "overhead_rate", String(id), { rate_type: c.req.param("rateType") });
    return ok(c, { rate_id: id });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/estimation-bases/:id/rates/import", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail(c, "VALIDATION_ERROR", "multipart/form-data が必要です。", 400);
  const file = form.get("file");
  if (!(file instanceof File)) return fail(c, "VALIDATION_ERROR", "file が必要です。", 400);
  try {
    const buffer = await file.arrayBuffer();
    const fileName = file.name.toLowerCase();
    const rows = fileName.endsWith(".xlsx")
      ? parseWorkbookRows(buffer)
      : parseCsv(decodeBuffer(buffer));
    const result = await importOverheadRates(sql, { baseId: c.req.param("id"), rows });
    await recordAudit(sql, identity, "overhead_rate.import", "estimation_base", c.req.param("id"), { imported: result.imported, errors: result.errors.length });
    return ok(c, { result });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/work-type-trees", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { trees: await listTrees(sql, c.req.query("base_id") ?? undefined) });
});

app.post("/api/work-type-trees", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = treeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await createTree(sql, parsed.data, identity);
    await recordAudit(sql, identity, "work_type_tree.create", "work_type_tree", String(id));
    return ok(c, { tree_id: id }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/work-breakdowns", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, {
    breakdowns: await listBreakdowns(sql, {
      baseId: c.req.query("base_id") ?? undefined,
      treeId: c.req.query("tree_id") ?? undefined,
    }),
  });
});

app.post("/api/work-breakdowns", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = breakdownSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await createBreakdown(sql, parsed.data, identity);
    await recordAudit(sql, identity, "work_breakdown.create", "work_breakdown", String(id));
    return ok(c, { breakdown_id: id }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.patch("/api/work-breakdowns/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = breakdownSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await updateBreakdown(sql, c.req.param("id"), parsed.data);
    if (!id) return fail(c, "NOT_FOUND", "歩掛が見つかりません。", 404);
    await recordAudit(sql, identity, "work_breakdown.update", "work_breakdown", String(id));
    return ok(c, { breakdown_id: id });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/work-breakdowns/import", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail(c, "VALIDATION_ERROR", "multipart/form-data が必要です。", 400);
  const file = form.get("file");
  const baseId = String(form.get("base_id") ?? "");
  if (!(file instanceof File) || !baseId) {
    return fail(c, "VALIDATION_ERROR", "file と base_id が必要です。", 400);
  }
  try {
    const buffer = await file.arrayBuffer();
    const fileName = file.name.toLowerCase();
    const rows = fileName.endsWith(".xlsx")
      ? parseWorkbookRows(buffer)
      : parseCsv(decodeBuffer(buffer));
    const result = await importBreakdowns(sql, { baseId, rows, identity });
    await recordAudit(sql, identity, "work_breakdown.import", "estimation_base", baseId, { imported: result.imported, errors: result.errors.length });
    return ok(c, { result });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/quantities", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  const projectId = c.req.query("project_id") ?? "";
  if (!projectId) return fail(c, "VALIDATION_ERROR", "project_id が必要です。", 400);
  return ok(c, { quantities: await listQuantities(sql, projectId) });
});

app.post("/api/quantities", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = quantitySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await addQuantity(sql, parsed.data, identity);
    await recordAudit(sql, identity, "quantity.create", "quantity", String(id));
    return ok(c, { quantity_id: id }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.patch("/api/quantities/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = quantitySchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await updateQuantity(sql, c.req.param("id"), parsed.data);
    if (!id) return fail(c, "NOT_FOUND", "数量が見つかりません。", 404);
    await recordAudit(sql, identity, "quantity.update", "quantity", String(id));
    return ok(c, { quantity_id: id });
  } catch (e) {
    return handleError(c, e);
  }
});

app.delete("/api/quantities/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  try {
    const id = await deleteQuantity(sql, c.req.param("id"));
    if (!id) return fail(c, "NOT_FOUND", "数量が見つかりません。", 404);
    await recordAudit(sql, identity, "quantity.delete", "quantity", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/estimates/calculate", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = z
    .object({
      project_id: z.string().min(1),
      base_id: z.string().min(1),
      name: z.string().min(1).max(200),
      port_options: z
        .object({
          operation_rate: z.number().min(0.1).max(1).optional(),
          mobilization_days: z.number().int().min(0).max(60).optional().nullable(),
          soil_correction: z.number().min(-0.5).max(2).optional(),
          night_surcharge: z.number().min(0).max(2).optional(),
          soil_type_code: z.string().optional().nullable(),
          spoil_ground_code: z.string().optional().nullable(),
          transport_distance_km: z.number().min(0).optional().nullable(),
          shift_rules: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const estimate = await calculateEstimate(sql, {
      projectId: parsed.data.project_id,
      baseId: parsed.data.base_id,
      name: parsed.data.name,
      identity,
      portOptions: parsed.data.port_options,
    });
    await recordAudit(sql, identity, "estimate.calculate", "estimate", String(estimate.id), { total: estimate.total });
    return ok(c, { estimate }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/estimates", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { estimates: await listEstimates(sql, c.req.query("project_id") ?? undefined) });
});

app.get("/api/estimates/:id", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  const estimate = await getEstimate(sql, c.req.param("id"));
  if (!estimate) return fail(c, "NOT_FOUND", "積算結果が見つかりません。", 404);
  return ok(c, { estimate });
});

app.get("/api/estimates/:id/export", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  try {
    const estimate = await getEstimate(sql, c.req.param("id"));
    if (!estimate) return fail(c, "NOT_FOUND", "積算結果が見つかりません。", 404);
    const buffer = await buildEstimateXlsx(sql, c.req.param("id"));
    return c.body(buffer, 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cci-estimate-${c.req.param("id").slice(0, 8)}.xlsx"`,
    });
  } catch (e) {
    return handleError(c, e);
  }
});

app.delete("/api/estimates/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  try {
    const id = await deleteEstimate(sql, c.req.param("id"));
    if (!id) return fail(c, "NOT_FOUND", "積算結果が見つかりません。", 404);
    await recordAudit(sql, identity, "estimate.delete", "estimate", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/estimates/:id/export.pdf", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  try {
    const fontBytes = await getCjkFontBytes(c.env);
    const buffer = await buildEstimatePdf(sql, c.req.param("id"), fontBytes);
    return c.body(toArrayBuffer(buffer), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cci-estimate-${c.req.param("id").slice(0, 8)}.pdf"`,
    });
  } catch (e) {
    return handleError(c, e);
  }
});

// ---- 設計変更・変更契約差額 ----

app.get("/api/change-orders", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  return ok(c, { change_orders: await listChangeOrders(sql, c.req.query("project_id") ?? undefined) });
});

app.post("/api/change-orders", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = changeOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await createChangeOrder(sql, parsed.data, identity);
    await recordAudit(sql, identity, "change_order.create", "change_order", String(id));
    return ok(c, { change_order_id: id }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/change-orders/:id", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  const changeOrder = await getChangeOrder(sql, c.req.param("id"));
  if (!changeOrder) return fail(c, "NOT_FOUND", "変更契約が見つかりません。", 404);
  return ok(c, { change_order: changeOrder });
});

app.delete("/api/change-orders/:id", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  try {
    const id = await deleteChangeOrder(sql, c.req.param("id"));
    if (!id) return fail(c, "NOT_FOUND", "変更契約が見つかりません。", 404);
    await recordAudit(sql, identity, "change_order.delete", "change_order", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/change-orders/:id/lines", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = changeLineSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const id = await addChangeOrderLine(sql, c.req.param("id"), parsed.data);
    await recordAudit(sql, identity, "change_order_line.create", "change_order_line", String(id));
    return ok(c, { line_id: id }, 201);
  } catch (e) {
    return handleError(c, e);
  }
});

app.delete("/api/change-orders/:id/lines/:lineId", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  try {
    const id = await deleteChangeOrderLine(sql, c.req.param("lineId"));
    if (!id) return fail(c, "NOT_FOUND", "変更明細が見つかりません。", 404);
    await recordAudit(sql, identity, "change_order_line.delete", "change_order_line", String(id));
    return ok(c, { deleted: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/change-orders/:id/export", async (c) => {
  const sql = getSql(c.env);
  await requireRole(c, sql, ["viewer"]);
  try {
    const changeOrder = await getChangeOrder(sql, c.req.param("id"));
    if (!changeOrder) return fail(c, "NOT_FOUND", "変更契約が見つかりません。", 404);
    const buffer = await buildChangeOrderXlsx(sql, c.req.param("id"));
    return c.body(buffer, 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cci-change-order-${c.req.param("id").slice(0, 8)}.xlsx"`,
    });
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/ai/breakdown-suggest", async (c) => {
  const sql = getSql(c.env);
  const identity = await requireRole(c, sql, ESTIMATE_WRITE_ROLES);
  const parsed = z
    .object({
      project_id: z.string().min(1),
      base_id: z.string().min(1),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues);
  try {
    const result = await aiSuggestBreakdowns(sql, c.env, {
      projectId: parsed.data.project_id,
      baseId: parsed.data.base_id,
      identity,
    });
    return ok(c, { suggestion: result });
  } catch (e) {
    return handleError(c, e);
  }
});

// ---- AI機能（Phase 1: AI市況ナビ） ----
// 原則: 集計・計算・アラート判定はコード側、AIは説明・要約のみ。
// AI未設定でも全エンドポイントがルール生成テキストで動作する。

app.get("/api/ai/status", (c) => {
  const info = getAiProviderInfo(c.env);
  return ok(c, {
    ai_enabled: info.provider !== "none",
    provider: info.provider,
    model: info.model,
    providers: getAvailableProviders(c.env),
    provider_label: info.provider === "none" ? "未設定" : getAvailableProviders(c.env).find((p) => p.provider === info.provider)?.label ?? info.provider,
    features: ["summary", "alert_explain", "report", "quality", "templates", "audit"],
  });
});

app.get("/api/ai/templates", (c) => ok(c, { templates: AI_TEMPLATES }));

const AUDIENCES = ["default", "executive", "estimator", "client"];

app.post("/api/ai/summary", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    // ボディ省略可（デフォルト条件で生成）
  }
  const audience = typeof body.audience === "string" ? body.audience : "default";
  if (!AUDIENCES.includes(audience)) {
    return fail(c, "VALIDATION_ERROR", `audience は ${AUDIENCES.join("/")} のいずれかを指定してください。`, 400);
  }
  const regionId = typeof body.region_id === "string" && body.region_id ? body.region_id : undefined;
  try {
    const sql = getSql(c.env);
    const result = await buildMarketSummary(sql, c.env, { regionId, audience: audience as Audience });
    return ok(c, result);
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/ai/alerts/explain", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    // ボディ省略可
  }
  const thresholdMom = Number(body.threshold_mom ?? 5);
  const thresholdYoy = Number(body.threshold_yoy ?? 10);
  const limit = Number(body.limit ?? 10);
  if (![thresholdMom, thresholdYoy, limit].every(Number.isFinite) || limit < 1 || limit > 50) {
    return fail(c, "VALIDATION_ERROR", "threshold/limit の値が不正です。", 400);
  }
  try {
    const sql = getSql(c.env);
    const result = await explainAlerts(sql, c.env, { thresholdMom, thresholdYoy, limit: Math.floor(limit) });
    return ok(c, result);
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/ai/report", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return fail(c, "VALIDATION_ERROR", "JSONボディが必要です。", 400);
  }
  const reportType = typeof body.report_type === "string" ? body.report_type : "";
  if (!(reportType in REPORT_TYPE_LABELS)) {
    return fail(c, "VALIDATION_ERROR", `report_type は ${Object.keys(REPORT_TYPE_LABELS).join("/")} のいずれかを指定してください。`, 400);
  }
  const regionId = typeof body.region_id === "string" && body.region_id ? body.region_id : undefined;
  try {
    const sql = getSql(c.env);
    const result = await generateReport(sql, c.env, { reportType: reportType as ReportType, regionId });
    return ok(c, result);
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/ai/quality", async (c) => {
  try {
    const sql = getSql(c.env);
    return ok(c, await runQualityChecks(sql));
  } catch (e) {
    return handleError(c, e);
  }
});

app.post("/api/ai/feedback", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, "VALIDATION_ERROR", "JSONボディが必要です。", 400);
  }
  const parsed = z
    .object({
      audit_id: z.string().uuid(),
      rating: z.string().min(1),
      comment: z.string().max(2000).optional().nullable(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "入力値が不正です。", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  try {
    const sql = getSql(c.env);
    const updated = await submitAiFeedback(sql, {
      auditId: parsed.data.audit_id,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    });
    if (!updated) return fail(c, "NOT_FOUND", "対象の監査ログが見つかりません。", 404);
    return ok(c, { updated: true });
  } catch (e) {
    return handleError(c, e);
  }
});

app.get("/api/ai/audit", async (c) => {
  if (!requireAdmin(c)) return fail(c, "UNAUTHORIZED", "管理者キーが必要です。", 401);
  const limit = Number(c.req.query("limit") ?? 50);
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    return fail(c, "VALIDATION_ERROR", "limit は 1〜200 で指定してください。", 400);
  }
  try {
    const sql = getSql(c.env);
    const logs = await listAiAudit(sql, { feature: c.req.query("feature") ?? undefined, limit: Math.floor(limit) });
    return ok(c, { logs });
  } catch (e) {
    return handleError(c, e);
  }
});

// Report（standalone互換: PDFを生成）
app.post("/api/export/report", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    // ボディ省略可
  }
  const dataType = typeof body.data_type === "string" ? body.data_type : "MATERIAL_PRICE";
  const normalize = body.normalize === true || body.normalize === "true" || body.normalize === "1";
  const toNullableString = (v: unknown): string | null =>
    typeof v === "string" && v ? v : null;
  try {
    const sql = getSql(c.env);
    const fontBytes = await getCjkFontBytes(c.env);
    const buffer = await buildPdfExport(
      sql,
      {
        dataType,
        itemIds: typeof body.item_ids === "string" ? body.item_ids.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        regionIds: typeof body.region_ids === "string" ? body.region_ids.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        startPeriod: toNullableString(body.start_period),
        endPeriod: toNullableString(body.end_period),
        normalize,
        basePeriod: toNullableString(body.base_period),
      },
      fontBytes
    );
    return c.body(toArrayBuffer(buffer), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cci-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
    });
  } catch (e) {
    return handleError(c, e);
  }
});

app.notFound((c) => fail(c, "NOT_FOUND", "エンドポイントが見つかりません。", 404));

app.onError((e, c) => handleError(c, e));

export default app;

// Cloudflare Cron による定期取得・未更新通知
export async function scheduled(
  _event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  ctx.waitUntil(
    (async () => {
      try {
        const sql = getSql(env);
        const summary = await runScheduledJobs(sql, env);
        console.log("scheduled_jobs", JSON.stringify(summary));
      } catch (e) {
        console.error("scheduled_jobs_failed", e);
      }
    })()
  );
}
