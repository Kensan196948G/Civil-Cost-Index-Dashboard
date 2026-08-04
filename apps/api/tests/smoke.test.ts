// Integration smoke test: runs the Hono app in Node against the real Neon DB.
// Requires apps/api/.dev.vars (DATABASE_URL) and network access.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devVarsPath = path.resolve(__dirname, "..", ".dev.vars");
const hasDb = !!process.env.DATABASE_URL || existsSync(devVarsPath);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any = null;
let env: Record<string, string> = {};

beforeAll(async () => {
  if (existsSync(devVarsPath)) {
    for (const line of readFileSync(devVarsPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for integration smoke test");
  }
  const mod = await import("../src/index");
  app = mod.default;
  env = {
    DATABASE_URL: process.env.DATABASE_URL!,
    DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT ?? "",
    ADMIN_API_KEY: process.env.ADMIN_API_KEY ?? "",
    CORS_ORIGINS: "http://localhost:3000",
    APP_VERSION: "0.1.0",
  };
});

async function get(pathname: string, init?: RequestInit) {
  const res = await app!.fetch(new Request(`http://localhost${pathname}`, init), env);
  return {
    status: res.status,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: JSON.parse(await res.text()) as { success: boolean; data: any; error: any; meta: any },
    text: await res.text().catch(() => ""),
  };
}

describe.skipIf(!hasDb)("integration smoke", () => {
  it("health live", async () => {
    const res = await app!.fetch(new Request("http://localhost/api/health/live"), env);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(res.status, text.slice(0, 300)).toBe(200);
    expect(body.success).toBe(true);
  });

  it("health ready", async () => {
    const res = await get("/api/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe("ok");
  });

  it("regions", async () => {
    const res = await get("/api/regions");
    expect(res.status).toBe(200);
    expect(res.body.data.regions.length).toBeGreaterThan(0);
    expect(res.body.data.regions[0].region_code).toBe("JP-01");
  });

  it("items with category filter", async () => {
    const res = await get("/api/items?category=MATERIAL_PRICE");
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items.every((i: { category: string }) => i.category === "MATERIAL_PRICE")).toBe(true);
  });

  it("timeseries with normalize", async () => {
    const res = await get("/api/timeseries?data_type=MATERIAL_PRICE&normalize=true&base_period=2025-01");
    expect(res.status).toBe(200);
    expect(res.body.data.series.length).toBeGreaterThan(0);
    const basePoint = res.body.data.series
      .flatMap((s: { points: Array<{ period: string; value: number | null }> }) => s.points)
      .find((p: { period: string }) => p.period === "2025-01");
    expect(basePoint).toBeDefined();
    expect(basePoint.value).toBe(100);
    expect(typeof res.body.data.series[0].data_kind).toBe("string");
    expect(typeof res.body.data.series[0].estimate_usable).toBe("boolean");
  });

  it("compare", async () => {
    const res = await get("/api/compare?series=MATERIAL_PRICE:STEEL_H:JP-01,PRICE_INDEX:INDEX_CONSTRUCTION:JP-01");
    expect(res.status).toBe(200);
    expect(res.body.data.series.length).toBe(2);
  });

  it("dashboard summary", async () => {
    const res = await get("/api/dashboard/summary");
    if (res.status !== 200) console.log("DASH ERR:", JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.data.latest_period).toMatch(/^\d{4}-\d{2}$/);
    expect(res.body.data.kpis.length).toBe(3);
  });

  it("alerts", async () => {
    const res = await get("/api/alerts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.alerts)).toBe(true);
  });

  it("data sources", async () => {
    const res = await get("/api/data-sources");
    expect(res.status).toBe(200);
    expect(res.body.data.data_sources.length).toBeGreaterThanOrEqual(3);
  });

  it("fetch jobs", async () => {
    const res = await get("/api/fetch-jobs");
    if (res.status !== 200) console.log("JOBS ERR:", JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.data.fetch_jobs.length).toBeGreaterThanOrEqual(3);
  });

  it("admin endpoints reject invalid key", async () => {
    const res = await get("/api/data-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": "wrong" },
      body: JSON.stringify({ source_code: "X", source_name: "X", source_type: "material", provider_name: "X" }),
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("url fetch endpoint rejects private addresses (no network)", async () => {
    const sourcesRes = await get("/api/data-sources");
    const sampleSource = sourcesRes.body.data.data_sources.find((s: { source_code: string }) => s.source_code === "SAMPLE_MATERIAL");
    const res = await get("/api/fetch-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: JSON.stringify({ data_source_id: sampleSource.id, url: "http://127.0.0.1/x" }),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("upload rejects duplicate file", async () => {
    const samplePath = path.resolve(__dirname, "..", "..", "..", "data", "samples", "sample_material_prices.csv");
    const content = readFileSync(samplePath);
    const form = new FormData();
    form.append("file", new Blob([content]), "sample_material_prices.csv");
    const sourcesRes = await get("/api/data-sources");
    const sampleSource = sourcesRes.body.data.data_sources.find((s: { source_code: string }) => s.source_code === "SAMPLE_MATERIAL");
    form.append("data_source_id", sampleSource.id);
    const res = await app!.fetch(new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: form,
    }), env);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CONFLICT");
  });

  it("csv export", async () => {
    const res = await app!.fetch(new Request("http://localhost/api/export/csv?data_type=MATERIAL_PRICE"), env);
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8").decode(bytes);
    expect(text).toContain("年月");
    expect(text).toContain("H形鋼");
  });

  it("xlsx export", async () => {
    const res = await app!.fetch(new Request("http://localhost/api/export/xlsx?data_type=MATERIAL_PRICE&normalize=true&base_period=2025-01"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const wb = XLSX.read(await res.arrayBuffer(), { type: "buffer" });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["概要", "明細", "出典"]));
    const detail = XLSX.utils.sheet_to_json(wb.Sheets["明細"], { header: 1 }) as unknown[][];
    expect(detail.length).toBeGreaterThan(1);
    expect(detail[0]).toContain("データ種別");
  });

  it("estimate-link export", async () => {
    const res = await app!.fetch(new Request("http://localhost/api/export/estimate-link"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const wb = XLSX.read(await res.arrayBuffer(), { type: "buffer" });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["単価候補", "改定差分"]));
  });

  it("pptx export", async () => {
    const res = await app!.fetch(new Request("http://localhost/api/export/pptx?data_type=MATERIAL_PRICE&normalize=true&base_period=2025-01"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("presentationml");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(new TextDecoder().decode(bytes)).toContain("建設コスト市況レポート");
  });

  it("auth/me returns admin roles with X-Admin-Key", async () => {
    const res = await get("/api/auth/me", { headers: { "X-Admin-Key": process.env.ADMIN_API_KEY! } });
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toContain("system_admin");
    expect(res.body.data.authenticated).toBe(true);
  });

  it("rbac: anonymous cannot create price version", async () => {
    const res = await get("/api/price-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data_source_id: "x", item_id: "y", value: 1, unit: "円/t", effective_start: "2026-04-01" }),
    });
    expect(res.status).toBe(401);
  });

  it("user management (create/list/patch)", async () => {
    const email = `smoke-${Date.now()}@example.com`;
    const created = await get("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: JSON.stringify({ email, display_name: "スモーク 利用者", roles: ["data_ingester", "estimator"] }),
    });
    expect(created.status).toBe(201);
    const userId = created.body.data.user.id;
    const list = await get("/api/users", { headers: { "X-Admin-Key": process.env.ADMIN_API_KEY! } });
    expect(list.status).toBe(200);
    expect(list.body.data.users.some((u: { email: string }) => u.email === email)).toBe(true);
    const patched = await get(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: JSON.stringify({ roles: ["auditor"], is_active: true }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data.user.roles).toContain("auditor");
    const removed = await get(`/api/users/${userId}`, { method: "DELETE", headers: { "X-Admin-Key": process.env.ADMIN_API_KEY! } });
    expect(removed.status).toBe(200);
  });

  it("price versions: create/approve/compare/snapshot", async () => {
    const dsRes = await get("/api/data-sources");
    const ds = dsRes.body.data.data_sources.find((s: { source_code: string }) => s.source_code === "SAMPLE_MATERIAL");
    const itemRes = await get("/api/items?category=MATERIAL_PRICE");
    const item = itemRes.body.data.items.find((i: { item_code: string }) => i.item_code === "STEEL_H");
    const regionRes = await get("/api/regions");
    const region = regionRes.body.data.regions.find((r: { region_code: string }) => r.region_code === "JP-01");
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };

    const created = await get("/api/price-versions", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({
        data_source_id: ds.id,
        item_id: item.id,
        region_id: region.id,
        version_label: "スモーク版",
        value: 88000,
        unit: "円/t",
        effective_start: "2026-04-01",
        tax_inclusive: false,
      }),
    });
    expect(created.status).toBe(201);
    const pvId = created.body.data.price_version.id;
    expect(created.body.data.price_version.status).toBe("draft");

    const approved = await get(`/api/price-versions/${pvId}/approve`, { method: "POST", headers: admin });
    expect(approved.status).toBe(200);
    expect(approved.body.data.price_version.status).toBe("approved");
    expect(approved.body.data.price_version.approved_by).toBe("admin-key");

    const compared = await get(`/api/price-versions/${pvId}/compare`);
    expect(compared.status).toBe(200);
    expect(compared.body.data.comparison.current.id).toBe(pvId);

    const snap = await get("/api/price-snapshots", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ name: "スモーク スナップショット", snapshot_date: "2026-08-04" }),
    });
    expect(snap.status).toBe(201);
    expect(snap.body.data.snapshot.items.length).toBeGreaterThan(0);

    const snapDetail = await get(`/api/price-snapshots/${snap.body.data.snapshot.id}`);
    expect(snapDetail.status).toBe(200);
    expect(snapDetail.body.data.snapshot.items[0].value).toBe(88000);

    const snapRemoved = await get(`/api/price-snapshots/${snap.body.data.snapshot.id}`, { method: "DELETE", headers: admin });
    expect(snapRemoved.status).toBe(200);
    const pvRemoved = await get(`/api/price-versions/${pvId}`, { method: "DELETE", headers: admin });
    expect(pvRemoved.status).toBe(200);
  });

  it("projects: create/add item/simulate/delete", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const itemRes = await get("/api/items?category=MATERIAL_PRICE");
    const item = itemRes.body.data.items.find((i: { item_code: string }) => i.item_code === "STEEL_H");
    const indexRes = await get("/api/items?category=PRICE_INDEX");
    const indexItem = indexRes.body.data.items.find((i: { item_code: string }) => i.item_code === "INDEX_CONSTRUCTION");
    const regionRes = await get("/api/regions");
    const region = regionRes.body.data.regions.find((r: { region_code: string }) => r.region_code === "JP-01");

    const proj = await get("/api/projects", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ name: "スモーク 浚渫工事", work_type: "浚渫", status: "planning" }),
    });
    expect(proj.status).toBe(201);
    const projectId = proj.body.data.project.id;

    const itemAdded = await get(`/api/projects/${projectId}/items`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({
        item_id: item.id,
        region_id: region.id,
        quantity: 100,
        base_unit_price: 88000,
        procurement_month: "2026-09",
      }),
    });
    expect(itemAdded.status).toBe(201);

    const sim = await get(`/api/projects/${projectId}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: JSON.stringify({ scenarios: [{ name: "下振れ", delta: -0.1 }, { name: "標準", delta: 0 }, { name: "上振れ", delta: 0.1 }] }),
    });
    expect(sim.status).toBe(200);
    expect(sim.body.data.simulation.scenarios.length).toBe(3);
    expect(sim.body.data.simulation.scenarios[1].items[0].impact_amount).toBeCloseTo(0, 5);

    const simWithIndex = await get(`/api/projects/${projectId}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: JSON.stringify({
        scenarios: [{ name: "標準", delta: 0 }],
        index_item_id: indexItem.id,
        base_period: "2025-01",
      }),
    });
    expect(simWithIndex.status).toBe(200);
    expect(Array.isArray(simWithIndex.body.data.simulation.warnings)).toBe(true);

    const del = await get(`/api/projects/${projectId}`, { method: "DELETE", headers: admin });
    expect(del.status).toBe(200);
  });

  it("fetch schedules: create/list/patch and staged list", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const dsRes = await get("/api/data-sources");
    const ds = dsRes.body.data.data_sources.find((s: { source_code: string }) => s.source_code === "SAMPLE_MATERIAL");
    const created = await get("/api/fetch-schedules", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({
        data_source_id: ds.id,
        schedule_name: "スモーク スケジュール",
        schedule_type: "monthly",
        expected_day: 25,
        approval_required: true,
        enabled: true,
        notify_channels: ["teams"],
      }),
    });
    expect(created.status).toBe(201);
    const scheduleId = created.body.data.schedule_id;
    const list = await get("/api/fetch-schedules", { headers: admin });
    expect(list.status).toBe(200);
    expect(list.body.data.schedules.some((s: { id: string }) => s.id === scheduleId)).toBe(true);
    const patched = await get(`/api/fetch-schedules/${scheduleId}`, {
      method: "PATCH",
      headers: admin,
      body: JSON.stringify({ enabled: false }),
    });
    expect(patched.status).toBe(200);
    const staged = await get("/api/staged-ingestions", { headers: admin });
    expect(staged.status).toBe(200);
    expect(Array.isArray(staged.body.data.staged)).toBe(true);
    const removed = await get(`/api/fetch-schedules/${scheduleId}`, { method: "DELETE", headers: admin });
    expect(removed.status).toBe(200);
  });

  it("operation audit logs are recorded", async () => {
    const res = await get("/api/audit/operations", { headers: { "X-Admin-Key": process.env.ADMIN_API_KEY! } });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.logs)).toBe(true);
    expect(res.body.data.logs.some((l: { action: string }) => l.action === "user.create")).toBe(true);
  });

  it("port cost model: vessels / work-types / estimate", async () => {
    const vessels = await get("/api/port-models/vessels");
    expect(vessels.status).toBe(200);
    expect(vessels.body.data.vessels.length).toBeGreaterThan(0);
    const workTypes = await get("/api/port-models/work-types");
    expect(workTypes.status).toBe(200);
    const dredging = workTypes.body.data.work_types.find((w: { work_type_code: string }) => w.work_type_code === "DREDGING");
    expect(dredging.vessels.length).toBeGreaterThan(0);
    const est = await get("/api/port-models/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: JSON.stringify({ work_type_id: dredging.id, quantity: 10000, operation_rate: 0.7, mobilization_days: 2 }),
    });
    expect(est.status).toBe(200);
    expect(est.body.data.estimate.result.rows.length).toBe(dredging.vessels.length);
    expect(est.body.data.estimate.result.total_cost).toBeGreaterThan(0);
  });
});
