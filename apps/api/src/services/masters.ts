import type { Sql } from "../lib/db";

export async function listRegions(sql: Sql) {
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
    is_active: r.is_active,
  }));
}

export async function listItems(sql: Sql, category?: string) {
  const rows = category
    ? await sql`
        SELECT id, item_code, item_name, category, sub_category, standard_name,
               default_unit, data_kind, estimate_usable, display_order, is_active
        FROM items
        WHERE is_active = true AND category = ${category}
        ORDER BY display_order NULLS LAST, item_code
      `
    : await sql`
        SELECT id, item_code, item_name, category, sub_category, standard_name,
               default_unit, data_kind, estimate_usable, display_order, is_active
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
    data_kind: r.data_kind,
    estimate_usable: r.estimate_usable,
    display_order: r.display_order,
    is_active: r.is_active,
  }));
}
