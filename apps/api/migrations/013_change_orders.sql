-- Phase 5-5: 設計変更・変更契約差額

CREATE TABLE IF NOT EXISTS change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  base_id UUID REFERENCES estimation_bases(id),
  estimate_id UUID REFERENCES estimate_headers(id),
  name VARCHAR(200) NOT NULL,
  change_date DATE,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft / confirmed
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS change_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  tree_id UUID REFERENCES work_type_trees(id),
  tree_code VARCHAR(50),
  tree_name VARCHAR(200),
  unit VARCHAR(30),
  before_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  after_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  before_unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  after_unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  quantity_diff DECIMAL(18,4) NOT NULL DEFAULT 0,
  amount_diff DECIMAL(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_order_lines_order ON change_order_lines (change_order_id);
