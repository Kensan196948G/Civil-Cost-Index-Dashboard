-- Phase 6-2: 施工実績データ（社内実績単価の蓄積）

CREATE TABLE IF NOT EXISTS construction_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  item_id UUID REFERENCES items(id),
  region_id UUID REFERENCES regions(id),
  work_date DATE NOT NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  unit VARCHAR(30),
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  supplier_name VARCHAR(200),
  source_note TEXT,
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_construction_records_item ON construction_records (item_id, region_id);
