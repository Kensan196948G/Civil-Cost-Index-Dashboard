-- Keep the bundled development index source aligned with its semantic data kind.
-- Ingestion treats data-source governance as authoritative for all rows.

UPDATE data_sources
SET data_kind = 'official_index',
    estimate_usable = TRUE,
    updated_at = now()
WHERE source_code = 'SAMPLE_INDEX';

UPDATE time_series_values t
SET data_kind = ds.data_kind,
    estimate_usable = ds.estimate_usable,
    updated_at = now()
FROM data_sources ds
WHERE t.data_source_id = ds.id
  AND ds.source_code = 'SAMPLE_INDEX';
