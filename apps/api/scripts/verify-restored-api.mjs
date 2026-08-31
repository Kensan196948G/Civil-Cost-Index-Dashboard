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
await request("/api/timeseries?data_type=MATERIAL_PRICE", { headers: { "X-Admin-Key": adminKey } });

if (!regions.length || !items.length) throw new Error("restored master data is empty");

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
  checks: ["health", "regions", "items", "timeseries", "project-create", "project-simulate", "project-delete"],
}));
