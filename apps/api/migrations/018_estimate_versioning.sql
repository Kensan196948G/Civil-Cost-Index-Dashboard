-- 018: 積算の版固定・計算再現性（P0: 不変スナップショット / 確定フロー）
-- 評価指摘: 「元の数量・歩掛・単価版・基準データ一式を不変スナップショットとして固定できていない」

-- estimate_headers に入力スナップショット・ハッシュ・採用単価版・確定情報を追加
ALTER TABLE estimate_headers
  ADD COLUMN IF NOT EXISTS price_version_id UUID REFERENCES price_versions(id),
  ADD COLUMN IF NOT EXISTS input_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS confirmed_by VARCHAR(320),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_estimate_headers_snapshot_sha
  ON estimate_headers (snapshot_sha256);

CREATE INDEX IF NOT EXISTS idx_estimate_headers_price_version
  ON estimate_headers (price_version_id);
