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

  it("estimating: base/tree/quantity/calculate/export/ai-suggest/delete", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const basesRes = await get("/api/estimation-bases");
    expect(basesRes.status).toBe(200);
    const base = basesRes.body.data.estimation_bases.find((b: { base_code: string }) => b.base_code === "MLIT-2026");
    expect(base).toBeDefined();

    const treesRes = await get(`/api/work-type-trees?base_id=${base.id}`);
    expect(treesRes.status).toBe(200);
    const soil = treesRes.body.data.trees.find((t: { code: string }) => t.code === "SOIL_EXCAVATION");
    expect(soil).toBeDefined();

    const proj = await get("/api/projects", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ name: "スモーク 積算テスト", work_type: "土工", status: "planning" }),
    });
    expect(proj.status).toBe(201);
    const projectId = proj.body.data.project.id;

    const qty = await get("/api/quantities", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, tree_id: soil.id, quantity: 500, unit: "m3", condition_json: {} }),
    });
    expect(qty.status).toBe(201);

    const calc = await get("/api/estimates/calculate", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, base_id: base.id, name: "スモーク積算" }),
    });
    expect(calc.status).toBe(201);
    const estimate = calc.body.data.estimate;
    expect(estimate.total).toBeGreaterThan(0);
    expect(estimate.lines.length).toBe(1);

    const detail = await get(`/api/estimates/${estimate.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.estimate.materials.length).toBeGreaterThan(0);

    const xlsx = await app!.fetch(new Request(`http://localhost/api/estimates/${estimate.id}/export`), env);
    expect(xlsx.status).toBe(200);
    const wb = XLSX.read(await xlsx.arrayBuffer(), { type: "buffer" });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["総括表", "内訳", "単価表"]));

    const suggest = await get("/api/ai/breakdown-suggest", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, base_id: base.id }),
    });
    expect(suggest.status).toBe(200);
    expect(suggest.body.data.suggestion.suggestions.length).toBeGreaterThan(0);

    const delEst = await get(`/api/estimates/${estimate.id}`, { method: "DELETE", headers: admin });
    expect(delEst.status).toBe(200);
    const delProj = await get(`/api/projects/${projectId}`, { method: "DELETE", headers: admin });
    expect(delProj.status).toBe(200);
  });

  it("estimating: port (浚渫) with vessel hire/standby/mobilization", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const basesRes = await get("/api/estimation-bases");
    const portBase = basesRes.body.data.estimation_bases.find((b: { base_code: string }) => b.base_code === "PORT-2026");
    expect(portBase).toBeDefined();
    const treesRes = await get(`/api/work-type-trees?base_id=${portBase.id}`);
    const dredging = treesRes.body.data.trees.find((t: { code: string }) => t.code === "DREDGING");
    expect(dredging).toBeDefined();

    const proj = await get("/api/projects", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ name: "スモーク 港湾浚渫", work_type: "浚渫", status: "planning" }),
    });
    expect(proj.status).toBe(201);
    const projectId = proj.body.data.project.id;

    const qty = await get("/api/quantities", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, tree_id: dredging.id, quantity: 5600, unit: "m3", condition_json: {} }),
    });
    expect(qty.status).toBe(201);

    const calc = await get("/api/estimates/calculate", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({
        project_id: projectId,
        base_id: portBase.id,
        name: "スモーク港湾積算",
        port_options: {
          operation_rate: 0.7,
          mobilization_days: 3,
          soil_correction: 0,
          night_surcharge: 0,
          soil_type_code: "CLAY",
          spoil_ground_code: "SEA_DUMP_A",
          transport_distance_km: 15,
          shift_rules: ["NIGHT_22_05", "ROTATION_2"],
        },
      }),
    });
    expect(calc.status).toBe(201);
    const estimate = calc.body.data.estimate;
    expect(estimate.port_options).not.toBeNull();
    expect(estimate.port_extras.work_days).toBe(26); // グラブ10日 + 土運船16日
    expect(estimate.port_extras.mobilization_cost).toBe(4200000); // 3日×(950,000+450,000)
    expect(estimate.port_extras.soil_factor).toBe(1.15);
    expect(estimate.port_extras.transport_coefficient).toBe(1.08);
    expect(estimate.port_extras.disposal_cost).toBe(6720000);
    expect(estimate.port_extras.shift_labor_surcharge).toBe(0.75);
    expect(estimate.port_extras.shift_machinery_surcharge).toBe(0.55);
    expect(estimate.total).toBeGreaterThan(0);
    expect(estimate.materials.some((m: { resource_name: string }) => m.resource_name.includes("グラブ浚渫船"))).toBe(true);

    const xlsx = await app!.fetch(new Request(`http://localhost/api/estimates/${estimate.id}/export`), env);
    expect(xlsx.status).toBe(200);
    const wb = XLSX.read(await xlsx.arrayBuffer(), { type: "buffer" });
    expect(wb.SheetNames).toContain("港湾補足");

    const delEst = await get(`/api/estimates/${estimate.id}`, { method: "DELETE", headers: admin });
    expect(delEst.status).toBe(200);
    const delProj = await get(`/api/projects/${projectId}`, { method: "DELETE", headers: admin });
    expect(delProj.status).toBe(200);
  }, 15000);

  it("port sea conditions and workability", async () => {
    const cond = await get("/api/port-models/sea-conditions?sea_area_code=SEA_TOKYO_BAY");
    expect(cond.status).toBe(200);
    expect(cond.body.data.sea_conditions).toHaveLength(12);
    const work = await get("/api/port-models/workability", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: JSON.stringify({ sea_area_code: "SEA_TOKYO_BAY", target_month: 8, wave_height: 1.5, wind_speed: 12 }),
    });
    expect(work.status).toBe(200);
    expect(work.body.data.workability.operation_rate).toBeGreaterThan(0);
    expect(work.body.data.workability.warnings.length).toBeGreaterThan(0);
  });

  it("coefficient import validation reports errors", async () => {
    const adminKey = process.env.ADMIN_API_KEY!;
    const basesRes = await get("/api/estimation-bases");
    const base = basesRes.body.data.estimation_bases.find((b: { base_code: string }) => b.base_code === "MLIT-2026");

    const rateForm = new FormData();
    rateForm.append("file", new Blob(["rate_type,rate,bad\ncommon_temp,0.1,1\nbad_type,0.2,2"], { type: "text/csv" }), "rates.csv");
    const rateRes = await app!.fetch(new Request("http://localhost/api/estimation-bases/" + base.id + "/rates/import", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
      body: rateForm,
    }), env);
    expect(rateRes.status).toBe(200);
    const rateBody = (await rateRes.json()) as { data: { result: { imported: number; errors: unknown[] } } };
    expect(rateBody.data.result.imported).toBe(1);
    expect(rateBody.data.result.errors.length).toBeGreaterThan(0);

    const vesselForm = new FormData();
    vesselForm.append("file", new Blob(["vessel_code,vessel_name,hire_rate_per_day\nBAD,,\n"], { type: "text/csv" }), "vessels.csv");
    const vesselRes = await app!.fetch(new Request("http://localhost/api/vessels/import", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
      body: vesselForm,
    }), env);
    expect(vesselRes.status).toBe(200);
    const vesselBody = (await vesselRes.json()) as { data: { result: { imported: number; errors: unknown[] } } };
    expect(vesselBody.data.result.imported).toBe(0);
    expect(vesselBody.data.result.errors.length).toBeGreaterThan(0);
  });

  it("change orders: create/line/diff/export/delete", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const proj = await get("/api/projects", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ name: "スモーク 変更契約", work_type: "土工", status: "contracted" }),
    });
    expect(proj.status).toBe(201);
    const projectId = proj.body.data.project.id;
    const co = await get("/api/change-orders", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, name: "スモーク設計変更", change_date: "2026-08-05", reason: "数量変更" }),
    });
    expect(co.status).toBe(201);
    const coId = co.body.data.change_order_id;
    const line = await get(`/api/change-orders/${coId}/lines`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({
        tree_code: "SOIL_EXCAVATION",
        tree_name: "掘削工",
        unit: "m3",
        before_quantity: 100,
        after_quantity: 120,
        before_unit_price: 1000,
        after_unit_price: 1100,
      }),
    });
    expect(line.status).toBe(201);
    const detail = await get(`/api/change-orders/${coId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.change_order.summary.net).toBe(32000);
    expect(detail.body.data.change_order.lines[0].amount_diff).toBe(32000);

    const xlsx = await app!.fetch(new Request(`http://localhost/api/change-orders/${coId}/export`), env);
    expect(xlsx.status).toBe(200);
    const wb = XLSX.read(await xlsx.arrayBuffer(), { type: "buffer" });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["差額集計", "変更明細"]));

    const delCo = await get(`/api/change-orders/${coId}`, { method: "DELETE", headers: admin });
    expect(delCo.status).toBe(200);
    const delProj = await get(`/api/projects/${projectId}`, { method: "DELETE", headers: admin });
    expect(delProj.status).toBe(200);
  });

  it("estimate PDF export", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const basesRes = await get("/api/estimation-bases");
    const base = basesRes.body.data.estimation_bases.find((b: { base_code: string }) => b.base_code === "MLIT-2026");
    const treesRes = await get(`/api/work-type-trees?base_id=${base.id}`);
    const soil = treesRes.body.data.trees.find((t: { code: string }) => t.code === "SOIL_EXCAVATION");
    const proj = await get("/api/projects", { method: "POST", headers: admin, body: JSON.stringify({ name: "スモーク PDF積算", work_type: "土工" }) });
    const projectId = proj.body.data.project.id;
    await get("/api/quantities", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, tree_id: soil.id, quantity: 1000, unit: "m3", condition_json: {} }),
    });
    const calc = await get("/api/estimates/calculate", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, base_id: base.id, name: "スモークPDF" }),
    });
    expect(calc.status).toBe(201);
    const estimateId = calc.body.data.estimate.id;
    const pdf = await app!.fetch(new Request(`http://localhost/api/estimates/${estimateId}/export.pdf`), env);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 8)).startsWith("%PDF-")).toBe(true);

    await get(`/api/estimates/${estimateId}`, { method: "DELETE", headers: admin });
    await get(`/api/projects/${projectId}`, { method: "DELETE", headers: admin });
  }, 15000);

  it("quotations: create/compare/adopt/export/delete", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const itemRes = await get("/api/items?category=MATERIAL_PRICE");
    const item = itemRes.body.data.items.find((i: { item_code: string }) => i.item_code === "STEEL_H");
    const proj = await get("/api/projects", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ name: "スモーク 見積比較", work_type: "土工" }),
    });
    const projectId = proj.body.data.project.id;

    const qa = await get("/api/quotations", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, supplier_name: "A社", quote_date: "2026-07-01", valid_until: "2026-07-15" }),
    });
    expect(qa.status).toBe(201);
    const qaId = qa.body.data.quotation_id;
    const qb = await get("/api/quotations", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, supplier_name: "B社", quote_date: "2026-08-01", valid_until: "2026-09-01" }),
    });
    const qbId = qb.body.data.quotation_id;
    await get(`/api/quotations/${qaId}/items`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ item_id: item.id, item_name: item.item_name, unit: "円/t", unit_price: 100000 }),
    });
    const bItem = await get(`/api/quotations/${qbId}/items`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ item_id: item.id, item_name: item.item_name, unit: "円/t", unit_price: 130000 }),
    });
    expect(bItem.status).toBe(201);
    const bItemId = bItem.body.data.item_id;

    const detailA = await get(`/api/quotations/${qaId}`);
    expect(detailA.status).toBe(200);
    expect(detailA.body.data.quotation.expiry.expired).toBe(true);
    const detailB = await get(`/api/quotations/${qbId}`);
    const bRow = detailB.body.data.quotation.comparison.find((c: { supplier_name: string }) => c.supplier_name === "B社");
    expect(bRow.deviation_rate).toBeGreaterThan(0);

    const adopt = await get(`/api/quotations/${qbId}/items/${bItemId}`, {
      method: "PATCH",
      headers: admin,
      body: JSON.stringify({ is_adopted: true, adoption_reason: "納期・実績を総合評価" }),
    });
    expect(adopt.status).toBe(200);
    const after = await get(`/api/quotations/${qbId}`);
    expect(after.body.data.quotation.items[0].is_adopted).toBe(true);

    const xlsx = await app!.fetch(new Request(`http://localhost/api/quotations/${qbId}/export`), env);
    expect(xlsx.status).toBe(200);
    const wb = XLSX.read(await xlsx.arrayBuffer(), { type: "buffer" });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["見積比較", "明細"]));

    await get(`/api/quotations/${qaId}`, { method: "DELETE", headers: admin });
    await get(`/api/quotations/${qbId}`, { method: "DELETE", headers: admin });
    await get(`/api/projects/${projectId}`, { method: "DELETE", headers: admin });
  }, 15000);

  it("quantity AI extraction: extract/suggest/approve/reject", async () => {
    const adminKey = process.env.ADMIN_API_KEY!;
    const basesRes = await get("/api/estimation-bases");
    const base = basesRes.body.data.estimation_bases.find((b: { base_code: string }) => b.base_code === "MLIT-2026");
    const proj = await get("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
      body: JSON.stringify({ name: "スモーク AI数量取込", work_type: "土工" }),
    });
    const projectId = proj.body.data.project.id;

    const csv = [
      "tree_code,item_name,quantity,unit,condition_json",
      ",掘削工,1000,m3,{\"soil\":\"clay\"}",
      ",コンクリート打設,120,m3,{}",
      ",アスファルト舗装,2000,m2,{}",
    ].join("\n");
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "quantities.csv");
    form.append("project_id", projectId);
    form.append("base_id", base.id);
    const res = await app!.fetch(new Request("http://localhost/api/quantities/ai-extract", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
      body: form,
    }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { result: { candidates: Array<{ suggestion_id: string; tree_code: string | null; match_method: string }> } } };
    const candidates = body.data.result.candidates;
    expect(candidates.length).toBe(3);
    expect(candidates.every((c) => c.match_method === "exact")).toBe(true);

    const list = await get(`/api/quantities/ai-suggestions?project_id=${projectId}&status=pending`);
    expect(list.status).toBe(200);
    expect(list.body.data.suggestions.length).toBe(3);

    const ok = await get(`/api/quantities/ai-suggestions/${candidates[0].suggestion_id}/approve`, {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
    });
    expect(ok.status).toBe(200);
    const ng = await get(`/api/quantities/ai-suggestions/${candidates[1].suggestion_id}/reject`, {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
    });
    expect(ng.status).toBe(200);
    const quantities = await get(`/api/quantities?project_id=${projectId}`);
    expect(quantities.body.data.quantities.length).toBe(1);

    await get(`/api/quantities/${quantities.body.data.quantities[0].id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKey } });
    await get(`/api/projects/${projectId}`, { method: "DELETE", headers: { "X-Admin-Key": adminKey } });
  }, 15000);

  it("estimation bases: compare / apply-check", async () => {
    const basesRes = await get("/api/estimation-bases");
    const mlit = basesRes.body.data.estimation_bases.find((b: { base_code: string }) => b.base_code === "MLIT-2026");
    const port = basesRes.body.data.estimation_bases.find((b: { base_code: string }) => b.base_code === "PORT-2026");
    const cmp = await get(`/api/estimation-bases/${mlit.id}/compare?other_id=${port.id}`);
    expect(cmp.status).toBe(200);
    expect(cmp.body.data.comparison.rates.length).toBe(3);
    const check = await get("/api/estimation-bases/apply-check?date=2026-06-01");
    expect(check.status).toBe(200);
    expect(check.body.data.result.bases.some((b: { base_code: string }) => b.base_code === "MLIT-2026")).toBe(true);
  });

  it("forecast scenario", async () => {
    const itemsRes = await get("/api/items?category=PRICE_INDEX");
    const indexItem = itemsRes.body.data.items.find((i: { item_code: string }) => i.item_code === "INDEX_CONSTRUCTION");
    const res = await get("/api/ai/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: JSON.stringify({ item_id: indexItem.id, horizon_months: 6 }),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.forecast.scenarios.length).toBe(4);
    expect(res.body.data.forecast.stats.latest_value).toBeGreaterThan(0);
  });

  it("construction records: import/create/summary/suggest-price/delete", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const itemRes = await get("/api/items?category=MATERIAL_PRICE");
    const item = itemRes.body.data.items.find((i: { item_code: string }) => i.item_code === "STEEL_H");
    const created = await get("/api/construction-records", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ item_id: item.id, work_date: "2026-07-15", quantity: 10, amount: 1200000, unit: "t", source_note: "スモーク実績" }),
    });
    expect(created.status).toBe(201);
    const recordId = created.body.data.record_id;
    const list = await get(`/api/construction-records?item_id=${item.id}`);
    expect(list.status).toBe(200);
    expect(list.body.data.records.length).toBeGreaterThan(0);
    const summary = await get(`/api/construction-records/summary?item_id=${item.id}`);
    expect(summary.status).toBe(200);
    expect(Number(summary.body.data.summary[0].median_unit_price)).toBe(120000);
    const suggested = await get("/api/construction-records/suggest-price", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ item_id: item.id }),
    });
    expect(suggested.status).toBe(201);
    const pvId = suggested.body.data.result.price_version_id;
    await get(`/api/price-versions/${pvId}`, { method: "DELETE", headers: admin });
    await get(`/api/construction-records/${recordId}`, { method: "DELETE", headers: admin });
  }, 15000);

  it("management reports (pdf/pptx) and drawing-extract requires vision", async () => {
    const pdf = await app!.fetch(new Request("http://localhost/api/reports/management.pdf"), env);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    const pptx = await app!.fetch(new Request("http://localhost/api/reports/management.pptx"), env);
    expect(pptx.status).toBe(200);
    expect(pptx.headers.get("content-type")).toContain("presentationml");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "dummy.png");
    form.append("project_id", "00000000-0000-0000-0000-000000000000");
    form.append("base_id", "00000000-0000-0000-0000-000000000000");
    const draw = await app!.fetch(new Request("http://localhost/api/ai/drawing-extract", {
      method: "POST",
      headers: { "X-Admin-Key": process.env.ADMIN_API_KEY! },
      body: form,
    }), env);
    expect(draw.status).toBe(501);
  }, 15000);

  it("rag: index/search/ask", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const idx = await get("/api/rag/index", { method: "POST", headers: admin });
    expect(idx.status).toBe(200);
    expect(idx.body.data.result.inserted).toBeGreaterThan(0);
    const search = await get("/api/rag/search", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ query: "掘削工の歩掛", limit: 5 }),
    });
    expect(search.status).toBe(200);
    expect(search.body.data.chunks.length).toBeGreaterThan(0);
    const ask = await get("/api/rag/ask", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ query: "掘削工の労務・機械構成を教えてください", limit: 5 }),
    });
    expect(ask.status).toBe(200);
    expect(ask.body.data.result.sources.length).toBeGreaterThan(0);
  }, 20000);

  it("quotation AI review (rule fallback)", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const proj = await get("/api/projects", { method: "POST", headers: admin, body: JSON.stringify({ name: "スモーク 査定AI", work_type: "土工" }) });
    const projectId = proj.body.data.project.id;
    const itemRes = await get("/api/items?category=MATERIAL_PRICE");
    const item = itemRes.body.data.items.find((i: { item_code: string }) => i.item_code === "STEEL_H");
    const q = await get("/api/quotations", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ project_id: projectId, supplier_name: "査定対象社", quote_date: "2026-08-01" }),
    });
    const qId = q.body.data.quotation_id;
    await get(`/api/quotations/${qId}/items`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ item_id: item.id, item_name: item.item_name, unit: "円/t", unit_price: 100000 }),
    });
    const review = await get(`/api/ai/quotation-review/${qId}`, { method: "POST", headers: admin });
    expect(review.status).toBe(200);
    expect(review.body.data.review.review.summary.length).toBeGreaterThan(0);
    await get(`/api/quotations/${qId}`, { method: "DELETE", headers: admin });
    await get(`/api/projects/${projectId}`, { method: "DELETE", headers: admin });
  }, 15000);

  it("forecast evaluation and port readiness", async () => {
    const admin = { "Content-Type": "application/json", "X-Admin-Key": process.env.ADMIN_API_KEY! };
    const itemsRes = await get("/api/items?category=PRICE_INDEX");
    const indexItem = itemsRes.body.data.items.find((i: { item_code: string }) => i.item_code === "INDEX_CONSTRUCTION");
    await get("/api/ai/forecast", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ item_id: indexItem.id, horizon_months: 3 }),
    });
    const evaled = await get("/api/ai/forecast/evaluate", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ item_id: indexItem.id, actual_value: 130, actual_period: "2026-07" }),
    });
    expect(evaled.status).toBe(200);
    expect(evaled.body.data.evaluation.error_rate).not.toBeNull();
    const list = await get(`/api/ai/forecast/evaluations?item_id=${indexItem.id}`);
    expect(list.status).toBe(200);
    expect(list.body.data.evaluations.some((e: { status: string }) => e.status === "evaluated")).toBe(true);
    const readiness = await get("/api/port-models/readiness");
    expect(readiness.status).toBe(200);
    expect(readiness.body.data.readiness.ready).toBe(true);
    const mgmt = await app!.fetch(new Request("http://localhost/api/reports/management.json"), env);
    expect(mgmt.status).toBe(200);
    const mgmtData = (await mgmt.json()) as { data: { data: { port_availability: number | null; project_profit_avg: number | null } } };
    expect(mgmtData.data.data).toHaveProperty("port_availability");
  }, 20000);
});
