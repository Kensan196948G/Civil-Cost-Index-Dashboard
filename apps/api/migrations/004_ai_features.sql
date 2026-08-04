-- AI拡張 Phase 1: AI利用監査ログ
-- AI回答の再現性・監査のため、質問・使用モデル・回答・根拠・評価を保存する。
-- 機密情報は記録前にアプリケーション側でマスキングする。

CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature TEXT NOT NULL,                -- summary / alert_explain / report / quality など
  question TEXT,                        -- 利用者入力・要求内容（マスキング済み）
  provider TEXT NOT NULL,               -- anthropic / workers-ai / rule-based
  model TEXT,                           -- 使用モデルID（ルール生成時はNULL）
  prompt_version TEXT,                  -- プロンプトのバージョン識別子
  data_scope JSONB,                     -- 使用データ範囲（期間・品目・地域など）
  response_text TEXT,                   -- AI回答本文
  sources JSONB,                        -- 引用元・出典
  status TEXT NOT NULL DEFAULT 'success', -- success / fallback / error
  error_message TEXT,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  rating TEXT,                          -- 利用者評価: good / bad / inaccurate など
  feedback_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_created_at ON ai_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_feature ON ai_audit_logs (feature);
