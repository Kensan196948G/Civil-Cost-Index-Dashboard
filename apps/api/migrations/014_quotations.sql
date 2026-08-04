-- Phase 5-6: 見積比較・査定支援

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  supplier_name VARCHAR(200) NOT NULL,
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',  -- draft / submitted / selected / rejected
  tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
  freight_included BOOLEAN NOT NULL DEFAULT FALSE,
  conditions_json JSONB NOT NULL DEFAULT '{}',
  note TEXT,
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id),
  tree_id UUID REFERENCES work_type_trees(id),
  item_name VARCHAR(200) NOT NULL,
  standard_name VARCHAR(200),
  unit VARCHAR(30),
  unit_price DECIMAL(18,2) NOT NULL,
  is_adopted BOOLEAN NOT NULL DEFAULT FALSE,
  adoption_reason TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items (quotation_id);
