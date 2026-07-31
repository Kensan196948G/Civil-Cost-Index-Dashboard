// Integration smoke test: runs the Hono app in Node against the real Neon DB.
// Requires apps/api/.dev.vars (DATABASE_URL) and network access.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

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
    const points = res.body.data.series[0].points;
    expect(points.length).toBeGreaterThan(0);
    const base = points.find((p: { period: string }) => p.period === "2025-01");
    expect(base.value).toBe(100);
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
});
