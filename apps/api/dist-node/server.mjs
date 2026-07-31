// src/server.ts
import { serve } from "@hono/node-server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// src/index.ts
import { Hono } from "hono";
import { z as z2 } from "zod";

// src/lib/http.ts
function ok(c, data, status = 200) {
  return c.json(
    {
      success: true,
      data,
      meta: {
        request_id: c.get("requestId"),
        generated_at: (/* @__PURE__ */ new Date()).toISOString()
      }
    },
    status
  );
}
function fail(c, code, message, status = 400, details = []) {
  return c.json(
    {
      success: false,
      error: { code, message, ...details.length ? { details } : {} },
      meta: { request_id: c.get("requestId") }
    },
    status
  );
}
async function requestIdMiddleware(c, next) {
  c.set("requestId", crypto.randomUUID());
  await next();
}
async function basicAuthMiddleware(c, next) {
  const user = (c.env.BASIC_AUTH_USERNAME || "").trim();
  const pass = (c.env.BASIC_AUTH_PASSWORD || "").trim();
  if (!user && !pass) return next();
  const header = c.req.header("Authorization") || "";
  const expected = "Basic " + btoa(`${user}:${pass}`);
  if (header !== expected) {
    c.header("WWW-Authenticate", 'Basic realm="cci", charset="UTF-8"');
    return fail(c, "UNAUTHORIZED", "Basic\u8A8D\u8A3C\u304C\u5FC5\u8981\u3067\u3059\u3002", 401);
  }
  return next();
}
async function corsMiddleware(c, next) {
  const origin = c.req.header("Origin");
  const allowed = (c.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
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
function requireAdmin(c) {
  const configured = (c.env.ADMIN_API_KEY || "").trim();
  if (!configured) return true;
  const provided = c.req.header("X-Admin-Key") || "";
  return provided === configured;
}

// src/lib/db.ts
import { neon } from "@neondatabase/serverless";
function getSql(env2) {
  if (!env2.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  return neon(env2.DATABASE_URL);
}

// src/services/masters.ts
async function listRegions(sql) {
  const rows = await sql`
    SELECT id, region_code, region_name, region_type, parent_region_id,
           display_order, is_active
    FROM regions
    WHERE is_active = true
    ORDER BY display_order NULLS LAST, region_code
  `;
  return rows.map((r) => ({
    id: r.id,
    region_code: r.region_code,
    region_name: r.region_name,
    region_type: r.region_type,
    parent_region_id: r.parent_region_id,
    display_order: r.display_order,
    is_active: r.is_active
  }));
}
async function listItems(sql, category) {
  const rows = category ? await sql`
        SELECT id, item_code, item_name, category, sub_category, standard_name,
               default_unit, display_order, is_active
        FROM items
        WHERE is_active = true AND category = ${category}
        ORDER BY display_order NULLS LAST, item_code
      ` : await sql`
        SELECT id, item_code, item_name, category, sub_category, standard_name,
               default_unit, display_order, is_active
        FROM items
        WHERE is_active = true
        ORDER BY display_order NULLS LAST, item_code
      `;
  return rows.map((r) => ({
    id: r.id,
    item_code: r.item_code,
    item_name: r.item_name,
    category: r.category,
    sub_category: r.sub_category,
    standard_name: r.standard_name,
    default_unit: r.default_unit,
    display_order: r.display_order,
    is_active: r.is_active
  }));
}

// src/services/dataSources.ts
import { z } from "zod";
var dataSourceCreateSchema = z.object({
  source_code: z.string().min(1).max(100),
  source_name: z.string().min(1).max(200),
  source_type: z.enum(["material", "labor", "index", "fuel", "other"]),
  provider_name: z.string().min(1).max(200),
  source_url: z.string().url().optional().nullable(),
  file_format: z.enum(["csv", "xlsx", "pdf", "html", "api"]).optional().nullable(),
  update_frequency: z.enum(["monthly", "yearly", "irregular"]).optional().nullable(),
  license_note: z.string().optional().nullable(),
  is_active: z.boolean().optional()
});
var dataSourcePatchSchema = dataSourceCreateSchema.partial();
async function listDataSources(sql) {
  const rows = await sql`
    SELECT id, source_code, source_name, source_type, provider_name, source_url,
           file_format, update_frequency, license_note, is_active,
           last_fetched_at, created_at, updated_at
    FROM data_sources
    ORDER BY is_active DESC, source_code
  `;
  return rows.map((r) => ({
    id: r.id,
    source_code: r.source_code,
    source_name: r.source_name,
    source_type: r.source_type,
    provider_name: r.provider_name,
    source_url: r.source_url,
    file_format: r.file_format,
    update_frequency: r.update_frequency,
    license_note: r.license_note,
    is_active: r.is_active,
    last_fetched_at: r.last_fetched_at,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
}
async function createDataSource(sql, input) {
  try {
    const [row] = await sql`
      INSERT INTO data_sources
        (source_code, source_name, source_type, provider_name, source_url,
         file_format, update_frequency, license_note, is_active)
      VALUES
        (${input.source_code}, ${input.source_name}, ${input.source_type}, ${input.provider_name},
         ${input.source_url ?? null}, ${input.file_format ?? null}, ${input.update_frequency ?? null},
         ${input.license_note ?? null}, ${input.is_active ?? true})
      RETURNING id, source_code, source_name, source_type, provider_name, source_url,
                file_format, update_frequency, license_note, is_active,
                last_fetched_at, created_at, updated_at
    `;
    return row;
  } catch (e) {
    if (String(e).includes("duplicate key")) {
      const err = new Error(`\u30C7\u30FC\u30BF\u30BD\u30FC\u30B9\u30B3\u30FC\u30C9 ${input.source_code} \u306F\u65E2\u306B\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u3059\u3002`);
      err.status = 409;
      throw err;
    }
    throw e;
  }
}
async function updateDataSource(sql, id, input) {
  const currentRows = await sql`
    SELECT source_code, source_name, source_type, provider_name, source_url,
           file_format, update_frequency, license_note, is_active
    FROM data_sources WHERE id = ${id}
  `;
  if (currentRows.length === 0) return null;
  const current = currentRows[0];
  const merged = {
    source_code: input.source_code ?? current.source_code,
    source_name: input.source_name ?? current.source_name,
    source_type: input.source_type ?? current.source_type,
    provider_name: input.provider_name ?? current.provider_name,
    source_url: input.source_url !== void 0 ? input.source_url : current.source_url,
    file_format: input.file_format !== void 0 ? input.file_format : current.file_format,
    update_frequency: input.update_frequency !== void 0 ? input.update_frequency : current.update_frequency,
    license_note: input.license_note !== void 0 ? input.license_note : current.license_note,
    is_active: input.is_active ?? current.is_active
  };
  const [row] = await sql`
    UPDATE data_sources SET
      source_code = ${merged.source_code},
      source_name = ${merged.source_name},
      source_type = ${merged.source_type},
      provider_name = ${merged.provider_name},
      source_url = ${merged.source_url},
      file_format = ${merged.file_format},
      update_frequency = ${merged.update_frequency},
      license_note = ${merged.license_note},
      is_active = ${merged.is_active},
      updated_at = now()
    WHERE id = ${id}
    RETURNING id, source_code, source_name, source_type, provider_name, source_url,
              file_format, update_frequency, license_note, is_active,
              last_fetched_at, created_at, updated_at
  `;
  return row;
}

// src/lib/stats.ts
function toHalfWidth(value) {
  return value.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248)).replace(/[，、]/g, ",").replace(/[．。]/g, ".");
}
function parseNumeric(value) {
  if (value == null) return null;
  const cleaned = toHalfWidth(value.trim()).replace(/,/g, "").replace(/[¥￥円]/g, "").replace(/[()（）].*$/, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "\u2014" || cleaned === "NA" || cleaned === "n/a") {
    return null;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}
function parsePeriod(value) {
  if (!value) return null;
  const s = toHalfWidth(value).trim();
  let m = s.match(/^(\d{4})[-/年](\d{1,2})月?$/);
  if (!m) {
    m = s.match(/^(令和|R)(\d{1,2})[年.](\d{1,2})月?$/);
    if (m) {
      const year = 2018 + Number(m[2]);
      return `${year}-${String(Number(m[3])).padStart(2, "0")}`;
    }
    m = s.match(/^(平成|H)(\d{1,2})[年.](\d{1,2})月?$/);
    if (m) {
      const eraYear = Number(m[2]);
      const year = eraYear === 0 ? 1989 : eraYear <= 30 ? 1988 + eraYear : 2019 + (eraYear - 30);
      return `${year}-${String(Number(m[3])).padStart(2, "0")}`;
    }
    m = s.match(/^(昭和|S)(\d{1,2})[年.](\d{1,2})月?$/);
    if (m) {
      const year = 1925 + Number(m[2]);
      return `${year}-${String(Number(m[3])).padStart(2, "0")}`;
    }
    return null;
  }
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}`;
}
function periodToDate(period) {
  return `${period}-01`;
}
function round2(value) {
  return Math.round(value * 100) / 100;
}
function addMonths(period, offset) {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + offset;
  return `${Math.floor(total / 12)}-${String(total % 12 + 1).padStart(2, "0")}`;
}
function computeRates(points) {
  const byPeriod = new Map(points.map((p) => [p.period, p.value]));
  const rates = /* @__PURE__ */ new Map();
  for (const p of points) {
    const prev = byPeriod.get(addMonths(p.period, -1));
    const yoyValue = byPeriod.get(addMonths(p.period, -12));
    const mom = prev != null && prev !== 0 ? round2((p.value / prev - 1) * 100) : null;
    const yoy = yoyValue != null && yoyValue !== 0 ? round2((p.value / yoyValue - 1) * 100) : null;
    rates.set(p.period, { mom, yoy });
  }
  return rates;
}
function normalizeSeries(points, basePeriod) {
  const sorted = [...points].sort((a, b) => a.period.localeCompare(b.period));
  const base = basePeriod ? sorted.find((p) => p.period === basePeriod) : sorted[0];
  if (!base) {
    const fallback = sorted[0];
    if (!fallback) return { values: /* @__PURE__ */ new Map(), baseRaw: null, baseUsed: null };
    const fallbackRaw = fallback.value !== 0 ? fallback.value : null;
    if (fallbackRaw == null) {
      return { values: new Map(sorted.map((p) => [p.period, p.value])), baseRaw: null, baseUsed: null };
    }
    return {
      values: new Map(sorted.map((p) => [p.period, round2(p.value / fallbackRaw * 100)])),
      baseRaw: fallbackRaw,
      baseUsed: fallback.period
    };
  }
  const baseRaw = base && base.value !== 0 ? base.value : null;
  if (baseRaw == null) {
    return { values: new Map(sorted.map((p) => [p.period, p.value])), baseRaw: null, baseUsed: null };
  }
  return {
    values: new Map(sorted.map((p) => [p.period, round2(p.value / baseRaw * 100)])),
    baseRaw,
    baseUsed: base.period
  };
}
function detectAlerts(seriesList, thresholdMom = 5, thresholdYoy = 10, limit = 20) {
  const alerts = [];
  for (const series of seriesList) {
    const sorted = [...series.points].sort((a, b) => a.period.localeCompare(b.period));
    const rates = computeRates(sorted);
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    const r = rates.get(last.period);
    const mom = r?.mom ?? null;
    const yoy = r?.yoy ?? null;
    const absYoy = yoy == null ? 0 : Math.abs(yoy);
    const absMom = mom == null ? 0 : Math.abs(mom);
    let reason = "";
    let priority = "low";
    if (absYoy >= 20) {
      reason = `\u524D\u5E74\u6BD4${yoy >= 0 ? "+" : ""}${yoy}%\uFF08\xB120%\u4EE5\u4E0A\uFF09`;
      priority = "high";
    } else if (absYoy >= thresholdYoy) {
      reason = `\u524D\u5E74\u6BD4${yoy >= 0 ? "+" : ""}${yoy}%\uFF08\xB1${thresholdYoy}%\u4EE5\u4E0A\uFF09`;
      priority = "medium";
    } else if (absMom >= thresholdMom) {
      reason = `\u524D\u6708\u6BD4${mom >= 0 ? "+" : ""}${mom}%\uFF08\xB1${thresholdMom}%\u4EE5\u4E0A\uFF09`;
      priority = "medium";
    } else {
      const tail = sorted.slice(-3).map((p) => rates.get(p.period)?.mom ?? 0);
      if (tail.length === 3 && tail.every((v) => v > 0)) {
        reason = "3\u304B\u6708\u4EE5\u4E0A\u9023\u7D9A\u4E0A\u6607";
        priority = "low";
      } else if (tail.length === 3 && tail.every((v) => v < 0)) {
        reason = "3\u304B\u6708\u4EE5\u4E0A\u9023\u7D9A\u4E0B\u843D";
        priority = "low";
      }
    }
    if (!reason) continue;
    alerts.push({
      item_name: series.item_name,
      region_name: series.region_name,
      period: last.period,
      mom_rate: mom,
      yoy_rate: yoy,
      reason,
      priority
    });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => order[a.priority] - order[b.priority] || (b.yoy_rate ?? 0) - (a.yoy_rate ?? 0)).slice(0, limit);
}

// src/services/timeseries.ts
async function fetchRawRows(sql, p) {
  const conditions = ["i.is_active = true", "r.is_active = true", "ds.is_active = true"];
  const params = [];
  if (p.dataTypes?.length) {
    params.push(p.dataTypes);
    conditions.push(`t.data_type = ANY($${params.length})`);
  } else {
    params.push(p.dataType);
    conditions.push(`t.data_type = $${params.length}`);
  }
  if (p.itemIds?.length) {
    params.push(p.itemIds);
    conditions.push(`t.item_id = ANY($${params.length})`);
  }
  if (p.regionIds?.length) {
    params.push(p.regionIds);
    conditions.push(`t.region_id = ANY($${params.length})`);
  }
  if (p.itemCodes?.length) {
    params.push(p.itemCodes);
    conditions.push(`i.item_code = ANY($${params.length})`);
  }
  if (p.regionCodes?.length) {
    params.push(p.regionCodes);
    conditions.push(`r.region_code = ANY($${params.length})`);
  }
  if (p.startPeriod) {
    params.push(periodToDate(p.startPeriod));
    conditions.push(`t.period_date >= $${params.length}::date`);
  }
  if (p.endPeriod) {
    params.push(periodToDate(p.endPeriod));
    conditions.push(`t.period_date <= $${params.length}::date`);
  }
  const rows = await sql(
    `
      SELECT t.id, t.data_source_id, t.data_type, t.item_id, i.item_name, i.item_code,
             t.region_id, r.region_name, r.region_code,
             to_char(t.period_date, 'YYYY-MM') AS period_date,
             t.value::text AS value, t.unit, t.value_status, t.note,
             ds.source_name, ds.source_url, t.source_file_id,
             to_char(t.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at
      FROM time_series_values t
      JOIN items i ON i.id = t.item_id
      JOIN regions r ON r.id = t.region_id
      JOIN data_sources ds ON ds.id = t.data_source_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY t.period_date ASC
    `,
    params
  );
  return rows;
}
function rawRowsToSeries(rows, p) {
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = `${row.item_id}:${row.region_id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  const series = [];
  for (const list of grouped.values()) {
    const first = list[0];
    const points = list.map((r) => ({ period: r.period_date, value: Number(r.value) }));
    const rates = computeRates(points);
    const normalized = normalizeSeries(points, p.basePeriod ?? null);
    const useNormalized = p.normalize && normalized.baseRaw != null;
    const sorted = [...list].sort((a, b) => a.period_date.localeCompare(b.period_date));
    series.push({
      series_id: `${first.data_type}:${first.item_code}:${first.region_code}`,
      label: `${first.item_name}\uFF5C${first.region_name}`,
      unit: useNormalized ? "index" : first.unit ?? "",
      source_name: first.source_name,
      source_url: first.source_url,
      points: sorted.map((r) => {
        const raw = Number(r.value);
        const normalizedValue = normalized.values.get(r.period_date);
        const rate = rates.get(r.period_date);
        return {
          period: r.period_date,
          value: useNormalized ? normalizedValue ?? null : raw,
          raw_value: raw,
          mom_rate: rate?.mom ?? null,
          yoy_rate: rate?.yoy ?? null,
          status: r.value_status
        };
      })
    });
  }
  return series.sort((a, b) => a.series_id.localeCompare(b.series_id));
}
async function buildTimeseries(sql, p) {
  const rows = await fetchRawRows(sql, p);
  const series = rawRowsToSeries(rows, p);
  return {
    conditions: {
      data_type: p.dataType,
      start_period: p.startPeriod ?? null,
      end_period: p.endPeriod ?? null,
      normalize: p.normalize,
      base_period: p.basePeriod ?? null
    },
    series
  };
}

// src/services/alerts.ts
async function listAlerts(sql, thresholdMom = 5, thresholdYoy = 10, limit = 20) {
  const rows = await sql`
    SELECT i.item_name, r.region_name,
           to_char(t.period_date, 'YYYY-MM') AS period,
           t.value::text AS value
    FROM time_series_values t
    JOIN items i ON i.id = t.item_id
    JOIN regions r ON r.id = t.region_id
    WHERE i.is_active = true AND r.is_active = true
      AND t.period_date >= (
        SELECT max(period_date) - interval '25 months' FROM time_series_values
      )
    ORDER BY t.period_date ASC
  `;
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = `${row.item_name}:${row.region_name}`;
    const entry = grouped.get(key) ?? {
      item_name: row.item_name,
      region_name: row.region_name,
      points: []
    };
    entry.points.push({ period: String(row.period), value: Number(row.value) });
    grouped.set(key, entry);
  }
  return detectAlerts([...grouped.values()], thresholdMom, thresholdYoy, limit);
}

// src/services/dashboard.ts
var KPI_DEFS = [
  { category: "MATERIAL_PRICE", name: "\u92FC\u6750\u4FA1\u683C", item_code: "STEEL_H" },
  { category: "LABOR_COST", name: "\u52B4\u52D9\u5358\u4FA1", item_code: "LABOR_COMMON" },
  { category: "PRICE_INDEX", name: "\u7269\u4FA1\u6307\u6570", item_code: "INDEX_CONSTRUCTION" }
];
async function getDashboardSummary(sql, opts) {
  const [latest] = await sql`
    SELECT to_char(max(period_date), 'YYYY-MM') AS period FROM time_series_values
  `;
  const [lastUpdated] = await sql`
    SELECT to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SSOF') AS at
    FROM time_series_values
  `;
  const kpis = [];
  for (const def of KPI_DEFS) {
    const conditions = ["i.item_code = $1", "i.category = $2"];
    const params = [def.item_code, def.category];
    if (opts.regionId) {
      params.push(opts.regionId);
      conditions.push(`t.region_id = $${params.length}`);
    }
    if (opts.period === "1y") {
      conditions.push(`t.period_date >= (SELECT max(period_date) - interval '13 months' FROM time_series_values)`);
    } else if (opts.period === "3y") {
      conditions.push(`t.period_date >= (SELECT max(period_date) - interval '37 months' FROM time_series_values)`);
    } else if (opts.period === "5y") {
      conditions.push(`t.period_date >= (SELECT max(period_date) - interval '61 months' FROM time_series_values)`);
    }
    const rows = await sql(
      `
      SELECT i.item_name, i.default_unit, r.region_name,
             to_char(t.period_date, 'YYYY-MM') AS period,
             t.value::text AS value
      FROM time_series_values t
      JOIN items i ON i.id = t.item_id
      JOIN regions r ON r.id = t.region_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY t.period_date ASC
      `,
      params
    );
    if (rows.length === 0) {
      kpis.push({
        name: def.name,
        value: null,
        unit: "",
        period: null,
        mom_rate: null,
        yoy_rate: null
      });
      continue;
    }
    const points = rows.map((r) => ({ period: r.period, value: Number(r.value) }));
    const rates = computeRates(points);
    const lastPoint = points[points.length - 1];
    const rate = rates.get(lastPoint.period);
    const normalized = normalizeSeries(points, opts.basePeriod ?? null);
    const isIndex = def.category === "PRICE_INDEX";
    kpis.push({
      name: def.name,
      value: isIndex ? normalized.baseRaw != null ? normalized.values.get(lastPoint.period) : lastPoint.value : lastPoint.value,
      unit: isIndex ? "\u6307\u6570" : rows[0].default_unit ?? "",
      period: lastPoint.period,
      mom_rate: rate?.mom ?? null,
      yoy_rate: rate?.yoy ?? null
    });
  }
  const alerts = await listAlerts(sql, 5, 10, 5);
  const sources = await sql`
    SELECT source_name, last_fetched_at FROM data_sources
    WHERE is_active = true
    ORDER BY last_fetched_at DESC NULLS LAST, source_code
    LIMIT 10
  `;
  const updateStatus = sources.map((s) => ({
    data_source_name: s.source_name,
    last_fetched_at: s.last_fetched_at,
    status: s.last_fetched_at ? "success" : "not_fetched"
  }));
  return {
    latest_period: latest?.period ?? null,
    last_updated_at: lastUpdated?.at ?? null,
    kpis,
    alerts,
    update_status: updateStatus
  };
}

// src/services/fetchJobs.ts
async function listFetchJobs(sql, opts) {
  const conditions = ["1 = 1"];
  const params = [];
  if (opts.status) {
    params.push(opts.status);
    conditions.push(`tl.transform_status = $${params.length}`);
  }
  params.push(opts.limit);
  const rows = await sql(
    `
    SELECT sf.id, sf.data_source_id, ds.source_name, sf.original_url,
           COALESCE(tl.transform_status, sf.fetch_status) AS status,
           sf.file_name, sf.file_hash, sf.fetched_at,
           tl.total_rows, tl.success_rows, tl.error_rows, tl.error_detail,
           tl.started_at, tl.finished_at
    FROM source_files sf
    JOIN data_sources ds ON ds.id = sf.data_source_id
    LEFT JOIN transform_logs tl ON tl.source_file_id = sf.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY sf.fetched_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    data_source_id: r.data_source_id,
    data_source_name: r.source_name,
    job_type: r.original_url ? "manual_fetch" : "manual_upload",
    status: r.status,
    file_name: r.file_name,
    file_hash: r.file_hash ? `sha256:${r.file_hash}` : null,
    total_rows: r.total_rows,
    success_rows: r.success_rows,
    error_rows: r.error_rows,
    error_detail: r.error_detail ?? [],
    started_at: r.started_at ?? r.fetched_at,
    finished_at: r.finished_at
  }));
}

// src/lib/csv.ts
function parseCsv(text) {
  const rows = [];
  const lines = [];
  let current = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    current.push(field);
    field = "";
  };
  const pushLine = () => {
    if (current.some((cell) => cell.trim() !== "")) {
      lines.push(current);
    }
    current = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushField();
      pushLine();
    } else if (ch === "\r") {
    } else {
      field += ch;
    }
  }
  pushField();
  pushLine();
  if (lines.length === 0) return rows;
  const header = lines[0].map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const row = {};
    header.forEach((h, idx) => {
      row[h] = (line[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}
function toCsv(headers, rows) {
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
}

// src/services/uploads.ts
var MAX_FILE_BYTES = 5 * 1024 * 1024;
var HEADER_ALIASES = {
  period: ["\u5E74\u6708", "period", "\u5BFE\u8C61\u5E74\u6708", "Period"],
  item: ["\u54C1\u76EE", "item", "\u54C1\u76EE\u540D", "\u9805\u76EE"],
  standard: ["\u898F\u683C", "standard", "\u898F\u683C\u540D", "\u4ED5\u69D8"],
  region: ["\u5730\u57DF", "region", "\u5730\u57DF\u540D"],
  value: ["\u5024", "value", "\u4FA1\u683C", "\u5358\u4FA1", "\u6570\u5024"],
  unit: ["\u5358\u4F4D", "unit"],
  status: ["\u72B6\u614B", "status", "value_status"],
  note: ["\u6CE8\u8A18", "note"],
  source: ["\u51FA\u5178", "source"]
};
function resolveHeader(header) {
  const h = header.trim();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return canonical;
  }
  return null;
}
async function handleUpload(sql, input) {
  const { fileName, buffer, dataSourceId } = input;
  if (buffer.byteLength > MAX_FILE_BYTES) {
    const err = new Error("\u30D5\u30A1\u30A4\u30EB\u30B5\u30A4\u30BA\u306F5MB\u4EE5\u5185\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    err.status = 400;
    throw err;
  }
  if (!/\.csv$/i.test(fileName)) {
    const err = new Error("CSV\u30D5\u30A1\u30A4\u30EB\u306E\u307F\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u53EF\u80FD\u3067\u3059\u3002");
    err.status = 400;
    throw err;
  }
  const sourceRows = await sql`SELECT id, source_name FROM data_sources WHERE id = ${dataSourceId}`;
  if (sourceRows.length === 0) {
    const err = new Error("\u30C7\u30FC\u30BF\u30BD\u30FC\u30B9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002");
    err.status = 404;
    throw err;
  }
  const dataSourceName = sourceRows[0].source_name;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const fileHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const dup = await sql`
    SELECT id FROM source_files
    WHERE data_source_id = ${dataSourceId} AND file_hash = ${fileHash}
  `;
  if (dup.length > 0) {
    const err = new Error("\u540C\u4E00\u5185\u5BB9\u306E\u30D5\u30A1\u30A4\u30EB\u304C\u65E2\u306B\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u3059\u3002");
    err.status = 409;
    throw err;
  }
  const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    const err = new Error("CSV\u306B\u30C7\u30FC\u30BF\u884C\u304C\u3042\u308A\u307E\u305B\u3093\u3002");
    err.status = 400;
    throw err;
  }
  const mapped = rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      const canonical = resolveHeader(k);
      if (canonical && out[canonical] === void 0) out[canonical] = v;
    }
    return out;
  });
  const items = await sql`
    SELECT id, item_code, item_name, category, default_unit FROM items WHERE is_active = true
  `;
  const regions = await sql`
    SELECT id, region_code, region_name FROM regions WHERE is_active = true
  `;
  const itemByCode = new Map(items.map((i) => [String(i.item_code), i]));
  const itemByName = new Map(items.map((i) => [String(i.item_name), i]));
  const regionByCode = new Map(regions.map((r) => [String(r.region_code), r]));
  const regionByName = new Map(regions.map((r) => [String(r.region_name), r]));
  const errorDetail = [];
  let successRows = 0;
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  for (let i = 0; i < mapped.length; i++) {
    const row = mapped[i];
    const rowNo = i + 2;
    const period = parsePeriod(row.period ?? "");
    if (!period) {
      errorDetail.push({ row: rowNo, column: "\u5E74\u6708", reason: "\u5E74\u6708\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059\uFF08YYYY-MM\u7B49\uFF09" });
      continue;
    }
    const rawValue = parseNumeric(row.value ?? "");
    if (rawValue == null) {
      errorDetail.push({ row: rowNo, column: "\u5024", reason: "\u6570\u5024\u5909\u63DB\u306B\u5931\u6557\u3057\u307E\u3057\u305F" });
      continue;
    }
    const itemName = (row.item ?? "").trim();
    const item = itemByCode.get(itemName) ?? itemByName.get(itemName);
    if (!item) {
      errorDetail.push({ row: rowNo, column: "\u54C1\u76EE", reason: "\u54C1\u76EE\u30DE\u30B9\u30BF\u306B\u672A\u767B\u9332\u3067\u3059" });
      continue;
    }
    const regionName = (row.region ?? "").trim();
    const region = regionByCode.get(regionName) ?? regionByName.get(regionName);
    if (!region) {
      errorDetail.push({ row: rowNo, column: "\u5730\u57DF", reason: "\u5730\u57DF\u30DE\u30B9\u30BF\u306B\u672A\u767B\u9332\u3067\u3059" });
      continue;
    }
    const unit = (row.unit ?? "").trim() || (item.default_unit ?? "");
    const statusMap = {
      confirmed: "confirmed",
      preliminary: "preliminary",
      revised: "revised",
      missing: "missing",
      \u3006: "confirmed",
      \u901F\u5831: "preliminary",
      \u3006\u78BA: "confirmed",
      \u78BA\u5831: "confirmed",
      \u6539\u5B9A: "revised",
      \u6B20\u640D: "missing"
    };
    const valueStatus = statusMap[(row.status ?? "confirmed").trim().toLowerCase()] ?? "confirmed";
    await sql`
      INSERT INTO time_series_values
        (data_source_id, data_type, item_id, region_id, period_type, period_date,
         value, unit, original_item_name, original_region_name, value_status, note)
      VALUES
        (${dataSourceId}, ${item.category}, ${item.id}, ${region.id}, 'monthly',
         ${`${period}-01`}::date, ${rawValue}, ${unit || null}, ${itemName}, ${regionName},
         ${valueStatus}, ${row.note || null})
      ON CONFLICT (data_source_id, data_type, item_id, region_id, period_date, unit)
      DO UPDATE SET value = EXCLUDED.value, value_status = EXCLUDED.value_status,
                    note = EXCLUDED.note, updated_at = now()
    `;
    successRows++;
  }
  const totalRows = mapped.length;
  const errorRows = totalRows - successRows;
  const status = errorRows === 0 ? "success" : successRows === 0 ? "failed" : "partial_success";
  const [fileRow] = await sql`
    INSERT INTO source_files
      (data_source_id, file_name, file_format, file_hash, fetch_status)
    VALUES
      (${dataSourceId}, ${fileName}, 'csv', ${fileHash}, 'success')
    RETURNING id, to_char(fetched_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS fetched_at
  `;
  const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  await sql`
    INSERT INTO transform_logs
      (source_file_id, transform_status, total_rows, success_rows, error_rows,
       error_detail, started_at, finished_at)
    VALUES
      (${fileRow.id}, ${status}, ${totalRows}, ${successRows}, ${errorRows},
       ${JSON.stringify(errorDetail)}, ${startedAt}::timestamptz, ${finishedAt}::timestamptz)
  `;
  await sql`UPDATE data_sources SET last_fetched_at = now(), updated_at = now() WHERE id = ${dataSourceId}`;
  return {
    id: String(fileRow.id),
    data_source_id: dataSourceId,
    data_source_name: dataSourceName,
    job_type: "manual_upload",
    status,
    file_name: fileName,
    file_hash: `sha256:${fileHash}`,
    total_rows: totalRows,
    success_rows: successRows,
    error_rows: errorRows,
    error_detail: errorDetail,
    started_at: startedAt,
    finished_at: finishedAt
  };
}

// src/services/exportCsv.ts
async function buildCsvExport(sql, p) {
  const rows = await fetchRawRows(sql, p);
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = `${row.item_id}:${row.region_id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  const outputRows = [];
  for (const list of grouped.values()) {
    const points = list.map((r) => ({ period: r.period_date, value: Number(r.value) }));
    const rates = computeRates(points);
    const normalized = normalizeSeries(points, p.basePeriod ?? null);
    const useNormalized = p.normalize && normalized.baseRaw != null;
    for (const row of list) {
      const raw = Number(row.value);
      const normValue = normalized.values.get(row.period_date);
      const rate = rates.get(row.period_date);
      outputRows.push([
        row.period_date,
        row.data_type,
        row.item_name,
        row.region_name,
        useNormalized ? normValue ?? null : raw,
        useNormalized ? "\u6307\u6570" : row.unit ?? "",
        rate?.mom ?? null,
        rate?.yoy ?? null,
        row.value_status,
        row.source_name,
        row.updated_at
      ]);
    }
  }
  const header = ["\u5E74\u6708", "\u30C7\u30FC\u30BF\u5206\u985E", "\u54C1\u76EE", "\u5730\u57DF", "\u5024", "\u5358\u4F4D", "\u524D\u6708\u6BD4", "\u524D\u5E74\u6BD4", "\u72B6\u614B", "\u51FA\u5178", "\u53D6\u5F97\u65E5\u6642"];
  return "\uFEFF" + toCsv(header, outputRows);
}

// src/index.ts
var app = new Hono();
app.use("*", requestIdMiddleware);
app.use("*", basicAuthMiddleware);
app.use("*", corsMiddleware);
var CATEGORIES = ["MATERIAL_PRICE", "LABOR_COST", "PRICE_INDEX", "FUEL_PRICE", "OTHER"];
function parseCsvList(value) {
  if (!value) return void 0;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
function parseBool(value) {
  return value === "true" || value === "1" || value === "yes";
}
function validatePeriod(value, name) {
  if (value == null || value === "") return null;
  const parsed = parsePeriod(value);
  if (!parsed) {
    throw new Error(`${name} \u306F YYYY-MM \u5F62\u5F0F\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  return parsed;
}
function errorStatus(e) {
  const status = e.status;
  return status ?? 500;
}
async function handleError(c, e) {
  const status = errorStatus(e);
  if (status === 400) return fail(c, "VALIDATION_ERROR", e.message, 400);
  if (status === 401) return fail(c, "UNAUTHORIZED", "\u7BA1\u7406\u8005\u30AD\u30FC\u304C\u7121\u52B9\u3067\u3059\u3002", 401);
  if (status === 404) return fail(c, "NOT_FOUND", e.message, 404);
  if (status === 409) return fail(c, "CONFLICT", e.message, 409);
  if (status === 501) return fail(c, "NOT_IMPLEMENTED", e.message, 501);
  console.error("internal_error", e);
  return fail(c, "INTERNAL_ERROR", "\u5185\u90E8\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002", 500);
}
app.get("/api/health/live", (c) => ok(c, { status: "ok", version: c.env.APP_VERSION ?? "unknown" }));
app.get("/api/health/ready", async (c) => {
  try {
    const sql = getSql(c.env);
    await sql`SELECT 1`;
    return ok(c, { status: "ok", database: "ok" });
  } catch (e) {
    console.error("ready_check_failed", e);
    return fail(c, "INTERNAL_ERROR", "\u30C7\u30FC\u30BF\u30D9\u30FC\u30B9\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002", 503);
  }
});
app.get("/api/regions", async (c) => {
  const sql = getSql(c.env);
  return ok(c, { regions: await listRegions(sql) });
});
app.get("/api/items", async (c) => {
  const category = c.req.query("category");
  if (category && !CATEGORIES.includes(category)) {
    return fail(c, "VALIDATION_ERROR", `category \u306F ${CATEGORIES.join("/")} \u306E\u3044\u305A\u308C\u304B\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002`, 400);
  }
  const sql = getSql(c.env);
  return ok(c, { items: await listItems(sql, category) });
});
var timeseriesQuerySchema = z2.object({
  data_type: z2.enum(CATEGORIES),
  item_ids: z2.string().optional(),
  region_ids: z2.string().optional(),
  start_period: z2.string().optional(),
  end_period: z2.string().optional(),
  normalize: z2.string().optional(),
  base_period: z2.string().optional()
});
app.get("/api/timeseries", async (c) => {
  const q = c.req.query();
  const parsed = timeseriesQuerySchema.safeParse(q);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "\u30D1\u30E9\u30E1\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059\u3002", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
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
      basePeriod: base
    });
    return ok(c, result);
  } catch (e) {
    return handleError(c, e);
  }
});
app.get("/api/compare", async (c) => {
  const seriesParam = c.req.query("series") ?? "";
  const tokens = seriesParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return fail(c, "VALIDATION_ERROR", "series \u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\uFF08dataType:itemCode:regionCode \u306E\u30AB\u30F3\u30DE\u533A\u5207\u308A\uFF09\u3002", 400);
  }
  if (tokens.length > 10) {
    return fail(c, "VALIDATION_ERROR", "series \u306F\u6700\u592710\u4EF6\u307E\u3067\u3067\u3059\u3002", 400);
  }
  const parsedTokens = [];
  for (const token of tokens) {
    const parts = token.split(":");
    if (parts.length !== 3 || !CATEGORIES.includes(parts[0]) || !parts[1] || !parts[2]) {
      return fail(c, "VALIDATION_ERROR", `series \u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059: ${token}`, 400);
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
      basePeriod: base
    });
    return ok(c, {
      conditions: {
        data_type: dataTypes.join(","),
        start_period: start,
        end_period: end,
        normalize: parseBool(c.req.query("normalize")),
        base_period: base
      },
      series: rawRowsToSeries(rows, { normalize: parseBool(c.req.query("normalize")), basePeriod: base })
    });
  } catch (e) {
    return handleError(c, e);
  }
});
app.get("/api/alerts", async (c) => {
  const thresholdMom = Number(c.req.query("threshold_mom") ?? 5);
  const thresholdYoy = Number(c.req.query("threshold_yoy") ?? 10);
  const limit = Number(c.req.query("limit") ?? 20);
  if (![thresholdMom, thresholdYoy, limit].every(Number.isFinite) || limit < 1 || limit > 100) {
    return fail(c, "VALIDATION_ERROR", "threshold/limit \u306E\u5024\u304C\u4E0D\u6B63\u3067\u3059\u3002", 400);
  }
  const sql = getSql(c.env);
  return ok(c, { alerts: await listAlerts(sql, thresholdMom, thresholdYoy, Math.floor(limit)) });
});
app.get("/api/dashboard/summary", async (c) => {
  try {
    const base = validatePeriod(c.req.query("base_period"), "base_period");
    const period = c.req.query("period");
    if (period && !["latest", "1y", "3y", "5y"].includes(period)) {
      return fail(c, "VALIDATION_ERROR", "period \u306F latest / 1y / 3y / 5y \u306E\u3044\u305A\u308C\u304B\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002", 400);
    }
    const sql = getSql(c.env);
    const summary = await getDashboardSummary(sql, {
      regionId: c.req.query("region_id") ?? void 0,
      basePeriod: base,
      period: period ?? void 0
    });
    return ok(c, summary);
  } catch (e) {
    return handleError(c, e);
  }
});
app.get("/api/data-sources", async (c) => {
  const sql = getSql(c.env);
  return ok(c, { data_sources: await listDataSources(sql) });
});
app.post("/api/data-sources", async (c) => {
  if (!requireAdmin(c)) return fail(c, "UNAUTHORIZED", "\u7BA1\u7406\u8005\u30AD\u30FC\u304C\u5FC5\u8981\u3067\u3059\u3002", 401);
  let body;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, "VALIDATION_ERROR", "JSON\u30DC\u30C7\u30A3\u304C\u5FC5\u8981\u3067\u3059\u3002", 400);
  }
  const parsed = dataSourceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "\u5165\u529B\u5024\u304C\u4E0D\u6B63\u3067\u3059\u3002", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
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
  if (!requireAdmin(c)) return fail(c, "UNAUTHORIZED", "\u7BA1\u7406\u8005\u30AD\u30FC\u304C\u5FC5\u8981\u3067\u3059\u3002", 401);
  const id = c.req.param("id");
  let body;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, "VALIDATION_ERROR", "JSON\u30DC\u30C7\u30A3\u304C\u5FC5\u8981\u3067\u3059\u3002", 400);
  }
  const parsed = dataSourcePatchSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "\u5165\u529B\u5024\u304C\u4E0D\u6B63\u3067\u3059\u3002", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  try {
    const sql = getSql(c.env);
    const updated = await updateDataSource(sql, id, parsed.data);
    if (!updated) return fail(c, "NOT_FOUND", "\u30C7\u30FC\u30BF\u30BD\u30FC\u30B9\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002", 404);
    return ok(c, updated);
  } catch (e) {
    return handleError(c, e);
  }
});
app.get("/api/fetch-jobs", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    return fail(c, "VALIDATION_ERROR", "limit \u306F 1\u301C200 \u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002", 400);
  }
  try {
    const sql = getSql(c.env);
    return ok(c, { fetch_jobs: await listFetchJobs(sql, { status: c.req.query("status"), limit: Math.floor(limit) }) });
  } catch (e) {
    return handleError(c, e);
  }
});
app.post("/api/uploads", async (c) => {
  if (!requireAdmin(c)) return fail(c, "UNAUTHORIZED", "\u7BA1\u7406\u8005\u30AD\u30FC\u304C\u5FC5\u8981\u3067\u3059\u3002", 401);
  let form;
  try {
    form = await c.req.formData();
  } catch {
    return fail(c, "VALIDATION_ERROR", "multipart/form-data \u304C\u5FC5\u8981\u3067\u3059\u3002", 400);
  }
  const file = form.get("file");
  const dataSourceId = String(form.get("data_source_id") ?? "");
  if (!(file instanceof File)) {
    return fail(c, "VALIDATION_ERROR", "file \u30D5\u30A3\u30FC\u30EB\u30C9\u304C\u5FC5\u8981\u3067\u3059\u3002", 400);
  }
  if (!dataSourceId) {
    return fail(c, "VALIDATION_ERROR", "data_source_id \u304C\u5FC5\u8981\u3067\u3059\u3002", 400);
  }
  try {
    const sql = getSql(c.env);
    const result = await handleUpload(sql, {
      fileName: file.name,
      buffer: await file.arrayBuffer(),
      dataSourceId
    });
    return ok(c, result, 201);
  } catch (e) {
    return handleError(c, e);
  }
});
app.get("/api/export/csv", async (c) => {
  const q = c.req.query();
  const parsed = timeseriesQuerySchema.safeParse(q);
  if (!parsed.success) {
    return fail(c, "VALIDATION_ERROR", "\u30D1\u30E9\u30E1\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059\u3002", 400, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
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
      basePeriod: base
    });
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cci-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`
    });
  } catch (e) {
    return handleError(c, e);
  }
});
app.post("/api/export/report", (c) => {
  return fail(c, "NOT_IMPLEMENTED", "PDF\u30EC\u30DD\u30FC\u30C8\u751F\u6210\u306F\u672A\u5B9F\u88C5\u3067\u3059\u3002", 501);
});
app.notFound((c) => fail(c, "NOT_FOUND", "\u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002", 404));
var index_default = app;

// src/server.ts
function loadDevVars() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", ".dev.vars"),
    path.resolve(process.cwd(), ".dev.vars")
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === void 0) process.env[m[1]] = m[2];
    }
    return;
  }
}
if (process.env.DATABASE_URL === void 0) loadDevVars();
var env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  ADMIN_API_KEY: process.env.ADMIN_API_KEY ?? "",
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? "",
  APP_VERSION: process.env.APP_VERSION ?? "0.1.0",
  BASIC_AUTH_USERNAME: process.env.BASIC_AUTH_USERNAME ?? "",
  BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD ?? ""
};
var port = Number(process.env.API_PORT ?? process.env.PORT ?? "8100");
var hostname = process.env.API_HOST ?? "0.0.0.0";
var server = serve(
  {
    port,
    hostname,
    fetch: (request) => index_default.fetch(request, env)
  },
  (info) => {
    console.log(`cci-api listening on http://${info.address}:${info.port}`);
  }
);
var shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`cci-api received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5e3).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
