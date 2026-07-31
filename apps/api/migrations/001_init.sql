-- Civil Cost Index Dashboard - initial schema (PostgreSQL / Neon)
-- Applied by apps/api/scripts/migrate.mjs

CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_code VARCHAR(50) NOT NULL UNIQUE,
    region_name VARCHAR(100) NOT NULL,
    region_type VARCHAR(30) NOT NULL DEFAULT 'national',
    parent_region_id UUID REFERENCES regions(id),
    display_order INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(100) NOT NULL UNIQUE,
    item_name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    sub_category VARCHAR(100),
    standard_name VARCHAR(200),
    default_unit VARCHAR(50),
    display_order INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_code VARCHAR(100) NOT NULL UNIQUE,
    source_name VARCHAR(200) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    provider_name VARCHAR(200) NOT NULL,
    source_url TEXT,
    file_format VARCHAR(20),
    update_frequency VARCHAR(30),
    license_note TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_series_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_source_id UUID NOT NULL REFERENCES data_sources(id),
    data_type VARCHAR(50) NOT NULL,
    item_id UUID REFERENCES items(id),
    region_id UUID REFERENCES regions(id),
    period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
    period_date DATE NOT NULL,
    value DECIMAL(18,4) NOT NULL,
    unit VARCHAR(50),
    base_period VARCHAR(20),
    original_item_name VARCHAR(200),
    original_region_name VARCHAR(200),
    source_file_id UUID,
    value_status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tsv_data_type_item_region_period_unit
        UNIQUE (data_source_id, data_type, item_id, region_id, period_date, unit)
);

CREATE INDEX IF NOT EXISTS idx_tsv_lookup
    ON time_series_values (data_type, item_id, region_id, period_date);
CREATE INDEX IF NOT EXISTS idx_tsv_period_date ON time_series_values (period_date);
CREATE INDEX IF NOT EXISTS idx_tsv_data_source ON time_series_values (data_source_id);

CREATE TABLE IF NOT EXISTS source_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_source_id UUID NOT NULL REFERENCES data_sources(id),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    original_url TEXT,
    file_name VARCHAR(255),
    file_format VARCHAR(20),
    file_hash VARCHAR(128),
    storage_path TEXT,
    fetch_status VARCHAR(20) NOT NULL DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_source_files_source_hash UNIQUE (data_source_id, file_hash)
);

CREATE INDEX IF NOT EXISTS idx_source_files_source_fetched
    ON source_files (data_source_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS transform_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file_id UUID NOT NULL REFERENCES source_files(id),
    transform_status VARCHAR(30) NOT NULL DEFAULT 'success',
    total_rows INTEGER,
    success_rows INTEGER,
    error_rows INTEGER,
    error_detail JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transform_logs_source_file
    ON transform_logs (source_file_id);
