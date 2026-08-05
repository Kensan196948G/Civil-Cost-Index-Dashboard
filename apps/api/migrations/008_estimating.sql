-- Phase 4: 積算エンジン土台（2026-08-05）
-- 積算基準 / 工種体系 / 数量計算書 / 歩掛 / 諸経費率 / 積算結果 / AI候補

CREATE TABLE IF NOT EXISTS estimation_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_code VARCHAR(50) NOT NULL UNIQUE,
  base_name VARCHAR(200) NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'general_civil',  -- general_civil / port / other
  fiscal_year INTEGER NOT NULL,
  applicable_from DATE NOT NULL,
  applicable_to DATE,
  rounding_rules JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft / approved / retired
  source_type VARCHAR(30),                       -- mlit_electronic / book_entry / system_export
  source_note TEXT,
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_type_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES estimation_bases(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES work_type_trees(id),
  level INTEGER NOT NULL DEFAULT 1,              -- 1=工種 2=区分子 3=細別 4=規格
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(30),
  standard_name VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tree_base_code UNIQUE (base_id, code)
);

CREATE TABLE IF NOT EXISTS quantities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tree_id UUID REFERENCES work_type_trees(id),
  item_name VARCHAR(200),
  standard_name VARCHAR(200),
  unit VARCHAR(30),
  quantity DECIMAL(18,4) NOT NULL,
  condition_json JSONB NOT NULL DEFAULT '{}',
  source_note TEXT,
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quantities_project ON quantities (project_id);

CREATE TABLE IF NOT EXISTS work_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES estimation_bases(id) ON DELETE CASCADE,
  tree_id UUID NOT NULL REFERENCES work_type_trees(id),
  condition_json JSONB NOT NULL DEFAULT '{}',
  labor_json JSONB NOT NULL DEFAULT '[]',        -- [{name, unit, quantity, unit_price}]
  material_json JSONB NOT NULL DEFAULT '[]',
  machinery_json JSONB NOT NULL DEFAULT '[]',
  note TEXT,
  source_type VARCHAR(30),
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_breakdowns_tree ON work_breakdowns (base_id, tree_id);

CREATE TABLE IF NOT EXISTS overhead_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES estimation_bases(id) ON DELETE CASCADE,
  rate_type VARCHAR(30) NOT NULL,                -- common_temp / site_management / general_management
  rate DECIMAL(10,6) NOT NULL,
  correction_json JSONB NOT NULL DEFAULT '{}',
  applicable_from DATE,
  applicable_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_overhead_base_type UNIQUE (base_id, rate_type)
);

CREATE TABLE IF NOT EXISTS estimate_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  base_id UUID NOT NULL REFERENCES estimation_bases(id),
  name VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',   -- draft / confirmed
  direct_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  common_temp_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  site_management_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  general_management_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  total DECIMAL(18,2) NOT NULL DEFAULT 0,
  rounding_rule_json JSONB NOT NULL DEFAULT '{}',
  warnings JSONB NOT NULL DEFAULT '[]',
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estimate_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimate_headers(id) ON DELETE CASCADE,
  tree_id UUID,
  tree_code VARCHAR(50),
  tree_name VARCHAR(200),
  unit VARCHAR(30),
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  breakdown_id UUID,
  labor_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  material_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  machinery_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  direct_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estimate_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimate_headers(id) ON DELETE CASCADE,
  line_id UUID REFERENCES estimate_lines(id) ON DELETE CASCADE,
  resource_type VARCHAR(20) NOT NULL,            -- labor / material / machinery
  resource_name VARCHAR(200) NOT NULL,
  unit VARCHAR(30),
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  price_version_id UUID REFERENCES price_versions(id),
  source_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_type VARCHAR(50) NOT NULL,          -- breakdown_selection / quantity_extraction / quotation_review / change_impact / explanation
  target_type VARCHAR(50),
  target_id VARCHAR(100),
  content JSONB NOT NULL,
  rationale TEXT,
  provider VARCHAR(30),
  model VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / accepted / rejected
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  reviewed_by VARCHAR(320),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- サンプル基準・歩掛（正式データ投入までの動作確認用）
INSERT INTO estimation_bases
  (base_code, base_name, category, fiscal_year, applicable_from, rounding_rules, status, source_type, source_note, created_by)
VALUES
  ('MLIT-2026', '土木工事標準積算基準（サンプル）', 'general_civil', 2026, '2026-04-01',
   '{"direct_cost":"yen_down","common_temp":"yen_down","site_management":"yen_down","general_management":"yen_down","subtotal":"yen_down","tax":"yen_down","total":"yen_down"}',
   'approved', 'mlit_electronic', 'サンプル。正式な歩掛・諸経費率データは別途投入する。', 'system'),
  ('PORT-2026', '港湾請負工事積算基準（サンプル）', 'port', 2026, '2026-04-01',
   '{"direct_cost":"yen_down","common_temp":"yen_down","site_management":"yen_down","general_management":"yen_down","subtotal":"yen_down","tax":"yen_down","total":"yen_down"}',
   'draft', 'book_entry', 'サンプル。令和8年度港湾積算基準の正式データは別途投入する。', 'system')
ON CONFLICT (base_code) DO NOTHING;

INSERT INTO overhead_rates (base_id, rate_type, rate, applicable_from)
SELECT id, 'common_temp', 0.1000, '2026-04-01' FROM estimation_bases WHERE base_code = 'MLIT-2026'
ON CONFLICT (base_id, rate_type) DO NOTHING;
INSERT INTO overhead_rates (base_id, rate_type, rate, applicable_from)
SELECT id, 'site_management', 0.1500, '2026-04-01' FROM estimation_bases WHERE base_code = 'MLIT-2026'
ON CONFLICT (base_id, rate_type) DO NOTHING;
INSERT INTO overhead_rates (base_id, rate_type, rate, applicable_from)
SELECT id, 'general_management', 0.1000, '2026-04-01' FROM estimation_bases WHERE base_code = 'MLIT-2026'
ON CONFLICT (base_id, rate_type) DO NOTHING;

-- 工種体系（土工・コンクリート工・舗装工の最小サンプル）
INSERT INTO work_type_trees (base_id, level, code, name, unit)
SELECT id, 1, 'SOIL', '土工', '' FROM estimation_bases WHERE base_code = 'MLIT-2026'
ON CONFLICT (base_id, code) DO NOTHING;
INSERT INTO work_type_trees (base_id, parent_id, level, code, name, unit)
SELECT b.id, t.id, 3, 'SOIL_EXCAVATION', '掘削工', 'm3'
FROM estimation_bases b JOIN work_type_trees t ON t.base_id = b.id AND t.code = 'SOIL'
WHERE b.base_code = 'MLIT-2026'
ON CONFLICT (base_id, code) DO NOTHING;

INSERT INTO work_type_trees (base_id, level, code, name, unit)
SELECT id, 1, 'CONCRETE', 'コンクリート工', '' FROM estimation_bases WHERE base_code = 'MLIT-2026'
ON CONFLICT (base_id, code) DO NOTHING;
INSERT INTO work_type_trees (base_id, parent_id, level, code, name, unit)
SELECT b.id, t.id, 3, 'CONCRETE_PLACING', 'コンクリート打設', 'm3'
FROM estimation_bases b JOIN work_type_trees t ON t.base_id = b.id AND t.code = 'CONCRETE'
WHERE b.base_code = 'MLIT-2026'
ON CONFLICT (base_id, code) DO NOTHING;

INSERT INTO work_type_trees (base_id, level, code, name, unit)
SELECT id, 1, 'PAVEMENT', '舗装工', '' FROM estimation_bases WHERE base_code = 'MLIT-2026'
ON CONFLICT (base_id, code) DO NOTHING;
INSERT INTO work_type_trees (base_id, parent_id, level, code, name, unit)
SELECT b.id, t.id, 3, 'PAVEMENT_ASPHALT', 'アスファルト舗装', 'm2'
FROM estimation_bases b JOIN work_type_trees t ON t.base_id = b.id AND t.code = 'PAVEMENT'
WHERE b.base_code = 'MLIT-2026'
ON CONFLICT (base_id, code) DO NOTHING;

-- 歩掛サンプル（掘削工: 普通作業員 + バックホウ）
INSERT INTO work_breakdowns (base_id, tree_id, condition_json, labor_json, material_json, machinery_json, note, source_type, created_by)
SELECT b.id, t.id, '{}',
  '[{"name":"普通作業員","unit":"人日","quantity":0.02,"unit_price":22000}]',
  '[]',
  '[{"name":"バックホウ 0.6m3","unit":"日","quantity":0.01,"unit_price":45000}]',
  'サンプル歩掛（正式データ未投入）', 'book_entry', 'system'
FROM estimation_bases b JOIN work_type_trees t ON t.base_id = b.id AND t.code = 'SOIL_EXCAVATION'
WHERE b.base_code = 'MLIT-2026'
  AND NOT EXISTS (SELECT 1 FROM work_breakdowns wb WHERE wb.tree_id = t.id);
