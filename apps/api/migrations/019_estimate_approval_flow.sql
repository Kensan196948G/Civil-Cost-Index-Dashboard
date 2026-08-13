-- 019: 積算の二段階承認フロー（draft → review → approved → superseded）
-- 評価指摘: 「確認・承認API、二段階承認、確定後編集禁止、変更版への派生、承認済み積算の削除禁止」

ALTER TABLE estimate_headers
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(320),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(320),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(320),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES estimate_headers(id),
  ADD COLUMN IF NOT EXISTS superseded_by_actor VARCHAR(320),
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_estimate_headers_status
  ON estimate_headers (status);

CREATE INDEX IF NOT EXISTS idx_estimate_headers_superseded_by
  ON estimate_headers (superseded_by);
