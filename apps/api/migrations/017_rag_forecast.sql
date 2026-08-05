-- Phase 6-4: RAG（pgvector）・予測実績誤差評価

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL,   -- estimation_base / work_breakdown / project / price_version
  source_id VARCHAR(100),
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  embedding vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS forecast_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id),
  item_name VARCHAR(200),
  forecast_date DATE NOT NULL,
  horizon_months INTEGER NOT NULL,
  forecast_value DECIMAL(18,4) NOT NULL,
  forecast_lower DECIMAL(18,4),
  forecast_upper DECIMAL(18,4),
  actual_value DECIMAL(18,4),
  actual_period VARCHAR(7),
  error_rate DECIMAL(10,6),
  sample_months INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / evaluated
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecast_evaluations_item ON forecast_evaluations (item_id, forecast_date DESC);
