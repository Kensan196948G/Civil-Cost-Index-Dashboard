-- 優先度A対応（2026-08-04）
-- RBAC・個人監査 / 単価版管理・スナップショット / 定期取得・承認待ち・通知 / 案件影響分析

-- ============================================================
-- 1. ユーザー・役割・監査
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL UNIQUE,
  display_name VARCHAR(200),
  roles JSONB NOT NULL DEFAULT '["viewer"]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email VARCHAR(320) NOT NULL,
  actor_role VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(100),
  detail JSONB,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_audit_created_at ON operation_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_op_audit_actor ON operation_audit_logs (actor_email);
CREATE INDEX IF NOT EXISTS idx_op_audit_resource ON operation_audit_logs (resource_type, resource_id);

-- ============================================================
-- 2. 単価版管理・スナップショット
-- ============================================================

CREATE TABLE IF NOT EXISTS price_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id UUID NOT NULL REFERENCES data_sources(id),
  item_id UUID NOT NULL REFERENCES items(id),
  region_id UUID REFERENCES regions(id),
  version_label VARCHAR(200),
  value DECIMAL(18,4) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  publication_date DATE,
  effective_start DATE NOT NULL,
  effective_end DATE,
  revised_at DATE,
  retroactive BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_terms VARCHAR(200),
  tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
  freight_included BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  parent_version_id UUID REFERENCES price_versions(id),
  approved_by VARCHAR(320),
  approved_at TIMESTAMPTZ,
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_versions_item ON price_versions (item_id, region_id, status);
CREATE INDEX IF NOT EXISTS idx_price_versions_effective ON price_versions (effective_start, effective_end);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_snapshot_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES price_snapshots(id) ON DELETE CASCADE,
  price_version_id UUID REFERENCES price_versions(id),
  item_id UUID NOT NULL REFERENCES items(id),
  region_id UUID REFERENCES regions(id),
  unit VARCHAR(50) NOT NULL,
  value DECIMAL(18,4) NOT NULL,
  data_source_name VARCHAR(200),
  effective_start DATE,
  effective_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_snapshot_item UNIQUE (snapshot_id, item_id, region_id, unit)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_items_snapshot ON price_snapshot_items (snapshot_id);

-- ============================================================
-- 3. 定期取得・承認待ち・通知
-- ============================================================

CREATE TABLE IF NOT EXISTS fetch_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id UUID NOT NULL REFERENCES data_sources(id),
  schedule_name VARCHAR(200),
  schedule_type VARCHAR(20) NOT NULL DEFAULT 'daily',  -- daily / monthly / yearly
  expected_day INTEGER,          -- 月次・年次の公表予定日（1〜31）
  expected_interval_days INTEGER, -- 更新間隔の目安（未更新検知用）
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  notify_channels JSONB NOT NULL DEFAULT '["teams","slack"]',
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_status VARCHAR(20),
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fetch_schedules_enabled ON fetch_schedules (enabled, next_run_at);

CREATE TABLE IF NOT EXISTS staged_ingestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id UUID NOT NULL REFERENCES data_sources(id),
  schedule_id UUID REFERENCES fetch_schedules(id),
  file_name VARCHAR(255),
  file_hash VARCHAR(128),
  original_url TEXT,
  staged_rows JSONB NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / approved / rejected
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  reviewed_by VARCHAR(320),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staged_status ON staged_ingestions (status, created_at);

CREATE TABLE IF NOT EXISTS notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(50) NOT NULL,
  subject TEXT,
  message TEXT,
  status VARCHAR(20) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications_log (created_at DESC);

-- ============================================================
-- 4. 案件・案件内訳（Phase 2: 案件影響分析）
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  client_name VARCHAR(200),
  work_type VARCHAR(100),
  region_id UUID REFERENCES regions(id),
  bid_date DATE,
  contract_date DATE,
  start_date DATE,
  end_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'planning',  -- planning / bidding / contracted / executing / completed
  created_by VARCHAR(320) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  region_id UUID REFERENCES regions(id),
  quantity DECIMAL(18,4) NOT NULL,
  base_unit_price DECIMAL(18,4) NOT NULL,
  procurement_month VARCHAR(7),  -- YYYY-MM 調達予定月
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_items_project ON project_items (project_id);
