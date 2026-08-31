const baseUrl = process.env.CCI_RESTORE_API_BASE_URL ?? "http://127.0.0.1:8000";
const adminKey = process.env.ADMIN_API_KEY;

if (!adminKey) throw new Error("ADMIN_API_KEY is required");

async function request(path, init = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${init.method ?? "GET"} ${path}: expected ${expectedStatus}, got ${response.status}: ${text.slice(0, 300)}`);
  }
  const body = JSON.parse(text);
  if (!body.success) throw new Error(`${init.method ?? "GET"} ${path}: API returned success=false`);
  return body.data;
}

const adminHeaders = {
  "Content-Type": "application/json",
  "X-Admin-Key": adminKey,
};

await request("/api/health/ready");
const regions = (await request("/api/regions", { headers: { "X-Admin-Key": adminKey } })).regions;
const items = (await request("/api/items", { headers: { "X-Admin-Key": adminKey } })).items;
const sources = (await request("/api/data-sources", { headers: { "X-Admin-Key": adminKey } })).data_sources;

if (!regions.length || !items.length) throw new Error("restored master data is empty");
if (regions.filter((region) => region.region_type === "prefecture").length !== 47) {
  throw new Error("restored prefecture master does not contain 47 prefectures");
}
const laborSource = sources.find((source) => source.source_code === "MLIT_LABOR");
const trendSource = sources.find((source) => source.source_code === "ESTAT_MATERIAL_SUPPLY");
if (laborSource?.data_kind !== "actual_price" || laborSource.estimate_usable !== true) {
  throw new Error("restored MLIT labor source governance is invalid");
}
if (trendSource?.data_kind !== "trend_assessment" || trendSource.estimate_usable !== false) {
  throw new Error("restored e-Stat material source governance is invalid");
}
const commonLabor = items.find((item) => item.item_code === "LABOR_COMMON");
const tokyo = regions.find((region) => region.region_name === "東京都");
if (!commonLabor || !tokyo) throw new Error("restored official labor master is incomplete");
const officialLabor = await request(
  `/api/timeseries?data_type=LABOR_COST&item_ids=${commonLabor.id}&region_ids=${tokyo.id}&start_period=2026-03&end_period=2026-03`,
  { headers: { "X-Admin-Key": adminKey } }
);
const laborSeries = officialLabor.series.find((series) => series.source_code === "MLIT_LABOR");
if (laborSeries?.points?.[0]?.raw_value !== 27000 || laborSeries.unit !== "円/日") {
  throw new Error("restored official Tokyo labor value is invalid");
}

let projectId;
try {
  const created = await request(
    "/api/projects",
    {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Restore drill verification", status: "planning" }),
    },
    201
  );
  projectId = created.project.id;

  await request(
    `/api/projects/${projectId}/items`,
    {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        item_id: items[0].id,
        region_id: regions[0].id,
        quantity: 1,
        base_unit_price: 1,
      }),
    },
    201
  );
  await request(`/api/projects/${projectId}/simulate`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ scenarios: [{ name: "restore-drill", delta: 0 }] }),
  });
} finally {
  if (projectId) {
    await request(`/api/projects/${projectId}`, { method: "DELETE", headers: adminHeaders });
  }
}

console.log(JSON.stringify({
  status: "ok",
  checks: [
    "health", "regions", "items", "source-governance", "official-labor-timeseries",
    "project-create", "project-simulate", "project-delete",
  ],
}));
