#!/usr/bin/env node
// Seed fictitious MVP demo workflows. Idempotent and safe to rerun after db:seed.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devVarsPath = path.join(__dirname, "..", ".dev.vars");
if (!process.env.DATABASE_URL && existsSync(devVarsPath)) {
  for (const line of readFileSync(devVarsPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const DEMO_ACTOR = "demo.system@example.invalid";
const demoTag = "CCI-MVP-DEMO";
const client = new pg.Client({ connectionString });
await client.connect();

async function one(sql, params = []) {
  const res = await client.query(sql, params);
  return res.rows[0] ?? null;
}

async function requireRow(label, sql, params = []) {
  const row = await one(sql, params);
  if (!row) throw new Error(`missing required seed reference: ${label}`);
  return row;
}

async function upsertUser(email, displayName, roles) {
  await client.query(
    `INSERT INTO users (email, display_name, roles, is_active)
     VALUES ($1, $2, $3::jsonb, true)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       roles = EXCLUDED.roles,
       is_active = true,
       updated_at = now()`,
    [email, displayName, JSON.stringify(roles)]
  );
}

async function upsertProject(input) {
  const existing = await one("SELECT id FROM projects WHERE name = $1", [input.name]);
  if (existing) {
    await client.query(
      `UPDATE projects SET client_name=$2, work_type=$3, region_id=$4,
         bid_date=$5, contract_date=$6, start_date=$7, end_date=$8,
         status=$9, updated_at=now()
       WHERE id=$1`,
      [
        existing.id,
        input.client_name,
        input.work_type,
        input.region_id,
        input.bid_date,
        input.contract_date,
        input.start_date,
        input.end_date,
        input.status,
      ]
    );
    return existing.id;
  }
  const row = await one(
    `INSERT INTO projects
       (name, client_name, work_type, region_id, bid_date, contract_date,
        start_date, end_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      input.name,
      input.client_name,
      input.work_type,
      input.region_id,
      input.bid_date,
      input.contract_date,
      input.start_date,
      input.end_date,
      input.status,
      DEMO_ACTOR,
    ]
  );
  return row.id;
}

async function upsertProjectItem(projectId, itemCode, regionId, quantity, unitPrice, month, note) {
  const item = await requireRow(`item ${itemCode}`, "SELECT id FROM items WHERE item_code=$1", [itemCode]);
  const existing = await one(
    "SELECT id FROM project_items WHERE project_id=$1 AND item_id=$2 AND procurement_month IS NOT DISTINCT FROM $3",
    [projectId, item.id, month]
  );
  if (existing) {
    await client.query(
      `UPDATE project_items SET region_id=$2, quantity=$3, base_unit_price=$4, note=$5, updated_at=now()
       WHERE id=$1`,
      [existing.id, regionId, quantity, unitPrice, note]
    );
    return existing.id;
  }
  const row = await one(
    `INSERT INTO project_items
       (project_id, item_id, region_id, quantity, base_unit_price, procurement_month, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [projectId, item.id, regionId, quantity, unitPrice, month, note]
  );
  return row.id;
}

async function upsertConstructionRecord(projectId, itemCode, regionId, workDate, quantity, amount, unit, supplierName) {
  const item = await requireRow(`item ${itemCode}`, "SELECT id FROM items WHERE item_code=$1", [itemCode]);
  const sourceNote = `${demoTag}: fictitious construction actual`;
  const existing = await one(
    `SELECT id FROM construction_records
     WHERE project_id IS NOT DISTINCT FROM $1 AND item_id=$2 AND region_id IS NOT DISTINCT FROM $3
       AND work_date=$4::date AND supplier_name=$5`,
    [projectId, item.id, regionId, workDate, supplierName]
  );
  const unitPrice = quantity > 0 ? amount / quantity : 0;
  if (existing) {
    await client.query(
      `UPDATE construction_records SET quantity=$2, amount=$3, unit=$4, unit_price=$5,
         source_note=$6, updated_at=now()
       WHERE id=$1`,
      [existing.id, quantity, amount, unit, unitPrice, sourceNote]
    );
    return;
  }
  await client.query(
    `INSERT INTO construction_records
       (project_id, item_id, region_id, work_date, quantity, amount, unit,
        unit_price, supplier_name, source_note, created_by)
     VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11)`,
    [projectId, item.id, regionId, workDate, quantity, amount, unit, unitPrice, supplierName, sourceNote, DEMO_ACTOR]
  );
}

async function upsertApprovedPriceVersion(itemCode, regionId, value, unit, effectiveStart, label) {
  const item = await requireRow(`item ${itemCode}`, "SELECT id FROM items WHERE item_code=$1", [itemCode]);
  const source = await requireRow("SAMPLE_MATERIAL source", "SELECT id FROM data_sources WHERE source_code='SAMPLE_MATERIAL'");
  const existing = await one(
    `SELECT id FROM price_versions
     WHERE item_id=$1 AND region_id IS NOT DISTINCT FROM $2 AND effective_start=$3::date
       AND version_label=$4`,
    [item.id, regionId, effectiveStart, label]
  );
  if (existing) {
    await client.query(
      `UPDATE price_versions SET value=$2, unit=$3, status='approved',
         approved_by=$4, approved_at=coalesce(approved_at, now()), note=$5, updated_at=now()
       WHERE id=$1`,
      [existing.id, value, unit, DEMO_ACTOR, `${demoTag}: fictitious adopted unit price`]
    );
    return existing.id;
  }
  const row = await one(
    `INSERT INTO price_versions
       (data_source_id, item_id, region_id, version_label, value, unit,
        publication_date, effective_start, delivery_terms, tax_inclusive,
        freight_included, note, status, approved_by, approved_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,false,true,$10,'approved',$11,now(),$12)
     RETURNING id`,
    [
      source.id,
      item.id,
      regionId,
      label,
      value,
      unit,
      effectiveStart,
      effectiveStart,
      "デモ現場持込",
      `${demoTag}: fictitious adopted unit price`,
      DEMO_ACTOR,
      DEMO_ACTOR,
    ]
  );
  return row.id;
}

async function ensureSnapshot(name, snapshotDate) {
  const existing = await one("SELECT id FROM price_snapshots WHERE name=$1", [name]);
  if (existing) return existing.id;
  const snap = await one(
    `INSERT INTO price_snapshots (name, description, snapshot_date, created_by)
     VALUES ($1,$2,$3::date,$4) RETURNING id`,
    [name, `${demoTag}: fictitious approved unit price set`, snapshotDate, DEMO_ACTOR]
  );
  const versions = await client.query(
    `SELECT pv.id, pv.item_id, pv.region_id, pv.unit, pv.value,
            pv.effective_start, pv.effective_end, ds.source_name
     FROM price_versions pv
     JOIN data_sources ds ON ds.id = pv.data_source_id
     WHERE pv.status='approved'
       AND pv.effective_start <= $1::date
       AND (pv.effective_end IS NULL OR pv.effective_end >= $1::date)
     ORDER BY pv.item_id, pv.region_id NULLS FIRST, pv.effective_start DESC`,
    [snapshotDate]
  );
  const seen = new Set();
  for (const v of versions.rows) {
    const key = `${v.item_id}|${v.region_id ?? ""}|${v.unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await client.query(
      `INSERT INTO price_snapshot_items
         (snapshot_id, price_version_id, item_id, region_id, unit, value,
          data_source_name, effective_start, effective_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (snapshot_id, item_id, region_id, unit) DO NOTHING`,
      [snap.id, v.id, v.item_id, v.region_id, v.unit, v.value, v.source_name, v.effective_start, v.effective_end]
    );
  }
  return snap.id;
}

async function upsertQuantity(projectId, treeCode, quantity, unit, condition, note) {
  const tree = await requireRow(`tree ${treeCode}`, "SELECT id FROM work_type_trees WHERE code=$1", [treeCode]);
  const existing = await one(
    "SELECT id FROM quantities WHERE project_id=$1 AND tree_id=$2 AND source_note=$3",
    [projectId, tree.id, note]
  );
  if (existing) {
    await client.query(
      "UPDATE quantities SET quantity=$2, unit=$3, condition_json=$4::jsonb, updated_at=now() WHERE id=$1",
      [existing.id, quantity, unit, JSON.stringify(condition)]
    );
    return existing.id;
  }
  const row = await one(
    `INSERT INTO quantities
       (project_id, tree_id, unit, quantity, condition_json, source_note, created_by)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
     RETURNING id`,
    [projectId, tree.id, unit, quantity, JSON.stringify(condition), note, DEMO_ACTOR]
  );
  return row.id;
}

async function upsertEstimate(projectId, baseCode, name, status) {
  const project = await requireRow("project", "SELECT id FROM projects WHERE id=$1", [projectId]);
  const base = await requireRow(`base ${baseCode}`, "SELECT id, rounding_rules FROM estimation_bases WHERE base_code=$1", [baseCode]);
  const existing = await one("SELECT id FROM estimate_headers WHERE project_id=$1 AND name=$2", [project.id, name]);
  const direct = name.includes("変更") ? 61465000 : 58750000;
  const common = Math.floor(direct * 0.1);
  const site = Math.floor(direct * 0.15);
  const general = Math.floor((direct + common + site) * 0.1);
  const subtotal = direct + common + site + general;
  const tax = Math.floor(subtotal * 0.1);
  const total = subtotal + tax;
  const snapshot = {
    demo: true,
    tag: demoTag,
    project_id: project.id,
    base_code: baseCode,
    name,
    quantities: [{ tree_code: "SOIL_EXCAVATION", quantity: 820, unit: "m3" }],
  };
  const hash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const columns = [
    status,
    direct,
    common,
    site,
    general,
    subtotal,
    tax,
    total,
    JSON.stringify(base.rounding_rules ?? {}),
    JSON.stringify(["デモ用の架空積算です。正式な積算根拠には使用しないでください。"]),
    JSON.stringify(snapshot),
    hash,
  ];
  if (existing) {
    await client.query(
      `UPDATE estimate_headers SET
         direct_cost=$2, common_temp_cost=$3, site_management_cost=$4,
         general_management_cost=$5, subtotal=$6, tax_amount=$7, total=$8,
         rounding_rule_json=$9::jsonb, warnings=$10::jsonb, input_snapshot=$11::jsonb,
         snapshot_sha256=$12, status=$13::text,
         submitted_by=CASE WHEN $13::text IN ('review','approved','superseded') THEN $14 ELSE submitted_by END,
         submitted_at=CASE WHEN $13::text IN ('review','approved','superseded') THEN coalesce(submitted_at, now()) ELSE submitted_at END,
         approved_by=CASE WHEN $13::text IN ('approved','superseded') THEN $14 ELSE approved_by END,
         approved_at=CASE WHEN $13::text IN ('approved','superseded') THEN coalesce(approved_at, now()) ELSE approved_at END,
         confirmed_by=CASE WHEN $13::text IN ('approved','superseded') THEN $14 ELSE confirmed_by END,
         confirmed_at=CASE WHEN $13::text IN ('approved','superseded') THEN coalesce(confirmed_at, now()) ELSE confirmed_at END,
         updated_at=now()
       WHERE id=$1`,
      [existing.id, ...columns.slice(1), status, DEMO_ACTOR]
    );
    await upsertEstimateLines(existing.id, baseCode, name.includes("変更"));
    return existing.id;
  }
  const estimate = await one(
    `INSERT INTO estimate_headers
       (project_id, base_id, name, status, direct_cost, common_temp_cost,
        site_management_cost, general_management_cost, subtotal, tax_amount,
        total, rounding_rule_json, warnings, input_snapshot, snapshot_sha256,
        created_by, submitted_by, submitted_at, approved_by, approved_at,
        confirmed_by, confirmed_at)
     VALUES
       ($1,$2,$3,$4::text,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16::text,
        CASE WHEN $4::text IN ('review','approved','superseded') THEN $16::text ELSE NULL END,
        CASE WHEN $4::text IN ('review','approved','superseded') THEN now() ELSE NULL END,
        CASE WHEN $4::text IN ('approved','superseded') THEN $16::text ELSE NULL END,
        CASE WHEN $4::text IN ('approved','superseded') THEN now() ELSE NULL END,
        CASE WHEN $4::text IN ('approved','superseded') THEN $16::text ELSE NULL END,
        CASE WHEN $4::text IN ('approved','superseded') THEN now() ELSE NULL END)
     RETURNING id`,
    [project.id, base.id, name, ...columns, DEMO_ACTOR]
  );
  await upsertEstimateLines(estimate.id, baseCode, name.includes("変更"));
  return estimate.id;
}

async function upsertEstimateLines(estimateId, baseCode, changed) {
  const tree = await requireRow("SOIL_EXCAVATION", "SELECT id, code, name, unit FROM work_type_trees WHERE code='SOIL_EXCAVATION' LIMIT 1");
  await client.query("DELETE FROM estimate_materials WHERE estimate_id=$1", [estimateId]);
  await client.query("DELETE FROM estimate_lines WHERE estimate_id=$1", [estimateId]);
  const qty = changed ? 860 : 820;
  const direct = changed ? 61465000 : 58750000;
  const line = await one(
    `INSERT INTO estimate_lines
       (estimate_id, tree_id, tree_code, tree_name, unit, quantity,
        labor_cost, material_cost, machinery_cost, direct_cost, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [estimateId, tree.id, tree.code, tree.name, "m3", qty, 9250000, direct - 25250000, 16000000, direct, `${demoTag}: fictitious estimate line ${baseCode}`]
  );
  const resources = [
    ["labor", "普通作業員", "人日", 92, 26000],
    ["material", "発生土運搬・処分", "m3", qty, changed ? 38500 : 36500],
    ["machinery", "バックホウ 0.8m3", "日", 41, 390000],
  ];
  for (const [type, name, unit, quantity, unitPrice] of resources) {
    await client.query(
      `INSERT INTO estimate_materials
         (estimate_id, line_id, resource_type, resource_name, unit, quantity,
          unit_price, amount, source_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [estimateId, line.id, type, name, unit, quantity, unitPrice, Number(quantity) * Number(unitPrice), `${demoTag}: fictitious resource`]
    );
  }
}

async function upsertQuotation(projectId, supplier, status, items) {
  const existing = await one(
    "SELECT id FROM quotations WHERE project_id=$1 AND supplier_name=$2 AND note LIKE $3",
    [projectId, supplier, `%${demoTag}%`]
  );
  const values = [
    projectId,
    supplier,
    "2026-07-24",
    "2026-09-30",
    status,
    false,
    true,
    JSON.stringify({ payment: "月末締翌月末払い", delivery: "架空デモ現場持込" }),
    `${demoTag}: fictitious supplier quote`,
    DEMO_ACTOR,
  ];
  let id = existing?.id;
  if (id) {
    await client.query(
      `UPDATE quotations SET quote_date=$2, valid_until=$3, status=$4,
         tax_inclusive=$5, freight_included=$6, conditions_json=$7::jsonb,
         note=$8, updated_at=now()
       WHERE id=$1`,
      [id, ...values.slice(2, 9)]
    );
  } else {
    id = (await one(
      `INSERT INTO quotations
         (project_id, supplier_name, quote_date, valid_until, status, tax_inclusive,
          freight_included, conditions_json, note, created_by)
       VALUES ($1,$2,$3::date,$4::date,$5,$6,$7,$8::jsonb,$9,$10)
       RETURNING id`,
      values
    )).id;
  }
  await client.query("DELETE FROM quotation_items WHERE quotation_id=$1", [id]);
  for (const item of items) {
    const master = await requireRow(`item ${item.code}`, "SELECT id, item_name, standard_name, default_unit FROM items WHERE item_code=$1", [item.code]);
    await client.query(
      `INSERT INTO quotation_items
         (quotation_id, item_id, item_name, standard_name, unit, unit_price,
          is_adopted, adoption_reason, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        master.id,
        master.item_name,
        master.standard_name,
        master.default_unit,
        item.price,
        item.adopted,
        item.adopted ? "デモ査定: 価格・納期・運賃条件が最も安定" : null,
        `${demoTag}: fictitious quote item`,
      ]
    );
  }
  return id;
}

async function upsertChangeOrder(projectId, baseCode, estimateId) {
  const base = await requireRow(`base ${baseCode}`, "SELECT id FROM estimation_bases WHERE base_code=$1", [baseCode]);
  const existing = await one("SELECT id FROM change_orders WHERE project_id=$1 AND name=$2", [projectId, "デモ用 第1回設計変更"]);
  let id = existing?.id;
  if (id) {
    await client.query(
      `UPDATE change_orders SET base_id=$2, estimate_id=$3, change_date='2026-08-20',
         reason=$4, status='confirmed', updated_at=now()
       WHERE id=$1`,
      [id, base.id, estimateId, `${demoTag}: 土質条件変更と夜間施工追加（架空）`]
    );
  } else {
    id = (await one(
      `INSERT INTO change_orders
         (project_id, base_id, estimate_id, name, change_date, reason, status, created_by)
       VALUES ($1,$2,$3,'デモ用 第1回設計変更','2026-08-20',$4,'confirmed',$5)
       RETURNING id`,
      [projectId, base.id, estimateId, `${demoTag}: 土質条件変更と夜間施工追加（架空）`, DEMO_ACTOR]
    )).id;
  }
  await client.query("DELETE FROM change_order_lines WHERE change_order_id=$1", [id]);
  const tree = await requireRow("SOIL_EXCAVATION", "SELECT id, code, name, unit FROM work_type_trees WHERE code='SOIL_EXCAVATION'");
  const lines = [
    [tree.id, tree.code, tree.name, tree.unit, 820, 860, 71646, 71471, "掘削数量の増加"],
    [null, "NIGHT_SHIFT", "夜間施工割増", "式", 0, 1, 0, 1850000, "施工時間帯変更"],
    [null, "SOIL_DISPOSAL", "土質区分変更処分費", "m3", 820, 860, 0, 1250, "粘性土混入率の上昇"],
  ];
  for (const l of lines) {
    const [treeId, code, name, unit, beforeQty, afterQty, beforeUnit, afterUnit, note] = l;
    const quantityDiff = Number(afterQty) - Number(beforeQty);
    const amountDiff = Number(afterQty) * Number(afterUnit) - Number(beforeQty) * Number(beforeUnit);
    await client.query(
      `INSERT INTO change_order_lines
         (change_order_id, tree_id, tree_code, tree_name, unit, before_quantity,
          after_quantity, before_unit_price, after_unit_price, quantity_diff,
          amount_diff, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, treeId, code, name, unit, beforeQty, afterQty, beforeUnit, afterUnit, quantityDiff, amountDiff, note]
    );
  }
  return id;
}

await client.query("BEGIN");
try {
  await upsertUser("demo.viewer@example.invalid", "デモ閲覧者", ["viewer"]);
  await upsertUser("demo.ingest@example.invalid", "デモデータ取込担当", ["viewer", "data_ingester"]);
  await upsertUser("demo.estimator@example.invalid", "デモ積算担当", ["viewer", "estimator"]);
  await upsertUser("demo.manager@example.invalid", "デモ積算責任者", ["viewer", "estimating_manager", "auditor"]);
  await upsertUser("demo.admin@example.invalid", "デモシステム管理者", ["viewer", "system_admin"]);

  const national = await requireRow("JP-01", "SELECT id FROM regions WHERE region_code='JP-01'");
  const kanto = await requireRow("JP-04", "SELECT id FROM regions WHERE region_code='JP-04'");

  const projectA = await upsertProject({
    name: "デモ用 架空東湾排水幹線更新工事",
    client_name: "Mirai Demo Public Works Bureau",
    work_type: "一般土木・管路更新",
    region_id: kanto.id,
    bid_date: "2026-09-10",
    contract_date: "2026-10-01",
    start_date: "2026-10-15",
    end_date: "2027-03-20",
    status: "bidding",
  });
  const projectB = await upsertProject({
    name: "デモ用 架空西港泊地浚渫工事",
    client_name: "Mirai Demo Port Authority",
    work_type: "港湾・浚渫",
    region_id: national.id,
    bid_date: "2026-08-28",
    contract_date: "2026-09-18",
    start_date: "2026-10-05",
    end_date: "2027-02-28",
    status: "contracted",
  });

  await upsertProjectItem(projectA, "STEEL_H", kanto.id, 42, 128500, "2026-10", `${demoTag}: H形鋼・架空`);
  await upsertProjectItem(projectA, "CONCRETE_18", kanto.id, 510, 18200, "2026-11", `${demoTag}: 生コン・架空`);
  await upsertProjectItem(projectA, "ASPHALT", kanto.id, 96, 21400, "2026-12", `${demoTag}: 舗装材料・架空`);
  await upsertProjectItem(projectB, "FUEL_LIGHT_OIL", national.id, 4800, 163, "2026-10", `${demoTag}: 作業船燃料・架空`);
  await upsertProjectItem(projectB, "CEMENT_PC", national.id, 220, 15100, "2026-11", `${demoTag}: 固化処理材・架空`);

  await upsertConstructionRecord(projectA, "STEEL_H", kanto.id, "2026-06-15", 38, 4833600, "円/t", "Fictional Kanto Steel Supply");
  await upsertConstructionRecord(projectA, "CONCRETE_18", kanto.id, "2026-06-18", 450, 8055000, "円/m3", "Demo ReadyMix Works");
  await upsertConstructionRecord(projectB, "FUEL_LIGHT_OIL", national.id, "2026-07-03", 5200, 842400, "円/L", "Sample Marine Fuel");

  await upsertApprovedPriceVersion("STEEL_H", kanto.id, 129200, "円/t", "2026-08-01", "デモ承認単価 2026-08 H形鋼");
  await upsertApprovedPriceVersion("CONCRETE_18", kanto.id, 18400, "円/m3", "2026-08-01", "デモ承認単価 2026-08 生コン");
  await upsertApprovedPriceVersion("ASPHALT", kanto.id, 21900, "円/t", "2026-08-01", "デモ承認単価 2026-08 アスファルト");
  await upsertApprovedPriceVersion("FUEL_LIGHT_OIL", national.id, 166, "円/L", "2026-08-01", "デモ承認単価 2026-08 軽油");
  await ensureSnapshot("デモ用 2026-08 承認単価スナップショット", "2026-08-13");

  await upsertQuantity(projectA, "SOIL_EXCAVATION", 820, "m3", { soil: "sandy", haul_distance_km: 6.5 }, `${demoTag}: demo quantity`);
  const draft = await upsertEstimate(projectA, "MLIT-2026", "デモ用 排水幹線 概算積算（下書き）", "draft");
  const approved = await upsertEstimate(projectA, "MLIT-2026", "デモ用 排水幹線 提出用積算（承認済み）", "approved");
  const change = await upsertEstimate(projectA, "MLIT-2026", "デモ用 排水幹線 変更積算（下書き）", "draft");
  await client.query(
    `UPDATE estimate_headers
     SET status='superseded', superseded_by=$2, superseded_by_actor=$3,
         superseded_at=coalesce(superseded_at, now()), updated_at=now()
     WHERE id=$1 AND status='approved'`,
    [approved, change, DEMO_ACTOR]
  );

  await upsertQuotation(projectA, "Fictional Civil Materials Co.", "selected", [
    { code: "STEEL_H", price: 127800, adopted: true },
    { code: "CONCRETE_18", price: 18150, adopted: true },
    { code: "ASPHALT", price: 22500, adopted: false },
  ]);
  await upsertQuotation(projectA, "Imaginary Infrastructure Supply", "submitted", [
    { code: "STEEL_H", price: 132600, adopted: false },
    { code: "CONCRETE_18", price: 17980, adopted: false },
    { code: "ASPHALT", price: 21800, adopted: true },
  ]);

  await upsertChangeOrder(projectA, "MLIT-2026", draft);

  await client.query(
    `INSERT INTO operation_audit_logs
       (actor_email, actor_role, action, resource_type, resource_id, detail)
     VALUES
       ($1, 'system_admin', 'demo.seed', 'mvp_demo', $2, $3::jsonb)`,
    [DEMO_ACTOR, projectA, JSON.stringify({ tag: demoTag, projects: [projectA, projectB] })]
  );

  await client.query("COMMIT");
  console.log(`demo seed complete: ${projectA}, ${projectB}`);
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
