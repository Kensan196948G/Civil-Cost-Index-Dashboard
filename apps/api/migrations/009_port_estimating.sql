-- Phase 5: 港湾3工種（浚渫・ケーソン・基礎捨石）を積算エンジンで計算可能にする

ALTER TABLE estimate_headers
  ADD COLUMN IF NOT EXISTS port_options JSONB,
  ADD COLUMN IF NOT EXISTS port_extras JSONB;

-- PORT-2026 基準に工種体系を追加（浚渫・ケーソン・基礎捨石）
INSERT INTO work_type_trees (base_id, level, code, name, unit)
SELECT id, 1, 'DREDGING', '浚渫工', 'm3' FROM estimation_bases WHERE base_code = 'PORT-2026'
ON CONFLICT (base_id, code) DO NOTHING;
INSERT INTO work_type_trees (base_id, level, code, name, unit)
SELECT id, 1, 'CAISSON', 'ケーソン製作・据付', '基' FROM estimation_bases WHERE base_code = 'PORT-2026'
ON CONFLICT (base_id, code) DO NOTHING;
INSERT INTO work_type_trees (base_id, level, code, name, unit)
SELECT id, 1, 'RUBBLE_BASE', '基礎捨石・被覆消波', 'm3' FROM estimation_bases WHERE base_code = 'PORT-2026'
ON CONFLICT (base_id, code) DO NOTHING;

-- 浚渫工の歩掛（グラブ浚渫船 + 土運船。船舶損料・供用係数・回航日数は vessels マスタから参照）
INSERT INTO work_breakdowns (base_id, tree_id, condition_json, labor_json, material_json, machinery_json, note, source_type, created_by)
SELECT b.id, t.id, '{}',
  '[{"name":"普通作業員（船上）","unit":"人日","quantity":0.01,"unit_price":24000}]',
  '[]',
  '[{"name":"グラブ浚渫船 8m3","unit":"日","quantity":1,"unit_price":950000,"vessel_id":"GRAB_8M3"},{"name":"土運船 500m3","unit":"日","quantity":1,"unit_price":450000,"vessel_id":"DUMP_BARGE"}]',
  'サンプル歩掛（港湾積算基準 令和8年度の正式係数に置換予定）', 'book_entry', 'system'
FROM estimation_bases b JOIN work_type_trees t ON t.base_id = b.id AND t.code = 'DREDGING'
WHERE b.base_code = 'PORT-2026'
  AND NOT EXISTS (SELECT 1 FROM work_breakdowns wb WHERE wb.tree_id = t.id);

-- ケーソン製作・据付（起重機船 + 台船 + 潜水士班）
INSERT INTO work_breakdowns (base_id, tree_id, condition_json, labor_json, material_json, machinery_json, note, source_type, created_by)
SELECT b.id, t.id, '{}',
  '[{"name":"潜水士・潜水送気員","unit":"人日","quantity":1.2,"unit_price":25000}]',
  '[]',
  '[{"name":"起重機船 150t吊","unit":"日","quantity":1,"unit_price":1200000,"vessel_id":"CRANE_150T"},{"name":"台船・作業船","unit":"日","quantity":1,"unit_price":300000,"vessel_id":"STAGE_BARGE"},{"name":"潜水士班","unit":"班日","quantity":1,"unit_price":250000,"vessel_id":"DIVER_TEAM"}]',
  'サンプル歩掛（港湾積算基準 令和8年度の正式係数に置換予定）', 'book_entry', 'system'
FROM estimation_bases b JOIN work_type_trees t ON t.base_id = b.id AND t.code = 'CAISSON'
WHERE b.base_code = 'PORT-2026'
  AND NOT EXISTS (SELECT 1 FROM work_breakdowns wb WHERE wb.tree_id = t.id);

-- 基礎捨石・被覆消波（起重機船 + 潜水士班）
INSERT INTO work_breakdowns (base_id, tree_id, condition_json, labor_json, material_json, machinery_json, note, source_type, created_by)
SELECT b.id, t.id, '{}',
  '[{"name":"潜水士・潜水送気員","unit":"人日","quantity":0.3,"unit_price":25000}]',
  '[{"name":"捨石（砕石）","unit":"m3","quantity":1.05,"unit_price":6500}]',
  '[{"name":"起重機船 150t吊","unit":"日","quantity":1,"unit_price":1200000,"vessel_id":"CRANE_150T"},{"name":"潜水士班","unit":"班日","quantity":1,"unit_price":250000,"vessel_id":"DIVER_TEAM"}]',
  'サンプル歩掛（港湾積算基準 令和8年度の正式係数に置換予定）', 'book_entry', 'system'
FROM estimation_bases b JOIN work_type_trees t ON t.base_id = b.id AND t.code = 'RUBBLE_BASE'
WHERE b.base_code = 'PORT-2026'
  AND NOT EXISTS (SELECT 1 FROM work_breakdowns wb WHERE wb.tree_id = t.id);
