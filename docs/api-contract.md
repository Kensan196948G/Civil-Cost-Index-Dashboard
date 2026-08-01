# Civil Cost Index Dashboard - API Contract (v0.1.0)

Base URL: `/api` (dev: `http://localhost:8000`)

## Common envelope

Success:
```json
{ "success": true, "data": {}, "meta": { "request_id": "uuid", "generated_at": "ISO8601" } }
```

Error:
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "入力値が不正です。", "details": [] }, "meta": { "request_id": "uuid" } }
```

Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `INTERNAL_ERROR`.

## Endpoints

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/api/health/live` | Liveness probe |
| GET | `/api/health/ready` | Readiness probe (DB check) |
| GET | `/api/regions` | Region master |
| GET | `/api/items?category=` | Item master (category filter) |
| GET | `/api/dashboard/summary` | Top dashboard summary |
| GET | `/api/timeseries` | Time series data |
| GET | `/api/compare` | Multi-series comparison |
| GET | `/api/alerts` | Notable movements |
| GET | `/api/data-sources` | Data source list |
| POST | `/api/data-sources` | Create data source (admin) |
| PATCH | `/api/data-sources/{id}` | Update data source (admin) |
| GET | `/api/fetch-jobs` | Fetch/transform history |
| POST | `/api/fetch-jobs` | Fetch from public URL and ingest (admin) |
| POST | `/api/uploads` | Upload CSV/Excel (admin, multipart) |
| GET | `/api/export/csv` | CSV export (same filters as /timeseries) |
| POST | `/api/export/report` | Minimal PDF report (optional) |

Admin endpoints require `X-Admin-Key: <ADMIN_API_KEY>` when `ADMIN_API_KEY` is configured.

## GET /api/regions

Response `data`:
```json
{ "regions": [ { "id": "uuid", "region_code": "JP-01", "region_name": "全国", "region_type": "national", "parent_region_id": null, "display_order": 1, "is_active": true } ] }
```

## GET /api/items

Query: `category` (optional: MATERIAL_PRICE / LABOR_COST / PRICE_INDEX / FUEL_PRICE / OTHER)

Response `data`:
```json
{ "items": [ { "id": "uuid", "item_code": "STEEL_H", "item_name": "H形鋼", "category": "MATERIAL_PRICE", "sub_category": "鋼材", "standard_name": "SS400 H-200x100", "default_unit": "円/t", "display_order": 1, "is_active": true } ] }
```

## GET /api/dashboard/summary

Query: `region_id`, `period` (`latest|1y|3y|5y`), `base_period` (`YYYY-MM`)

Response `data`:
```json
{
  "latest_period": "2026-06",
  "last_updated_at": "2026-07-31T10:00:00+09:00",
  "kpis": [ { "name": "鋼材価格", "value": 128.4, "unit": "index", "period": "2026-06", "mom_rate": 1.2, "yoy_rate": 8.5 } ],
  "alerts": [ { "item_name": "アスファルト", "region_name": "全国", "period": "2026-06", "mom_rate": 2.1, "yoy_rate": 12.3, "reason": "前年比10%以上", "priority": "medium" } ],
  "update_status": [ { "data_source_name": "公開統計", "last_fetched_at": "2026-07-31T10:00:00+09:00", "status": "success" } ]
}
```

## GET /api/timeseries

Query:
- `data_type` (required): MATERIAL_PRICE / LABOR_COST / PRICE_INDEX / FUEL_PRICE / OTHER
- `item_ids` (optional, comma separated)
- `region_ids` (optional, comma separated)
- `start_period`, `end_period` (`YYYY-MM`)
- `normalize` (`true|false`), `base_period` (`YYYY-MM`)

Response `data`:
```json
{
  "conditions": { "data_type": "MATERIAL_PRICE", "start_period": "2021-04", "end_period": "2026-06", "normalize": true, "base_period": "2021-04" },
  "series": [
    {
      "series_id": "steel-national",
      "label": "H形鋼｜全国",
      "unit": "index",
      "source_name": "公開統計",
      "source_url": "https://example.jp",
      "points": [
        { "period": "2021-04", "value": 100.0, "raw_value": 85000, "mom_rate": null, "yoy_rate": null, "status": "confirmed" }
      ]
    }
  ]
}
```

Rules: `value` is normalized (index) when `normalize=true`, otherwise `raw_value`. Missing points are omitted (line breaks). `status`: confirmed / preliminary / revised / missing.

## GET /api/compare

Query:
- `series` (required): comma separated `dataType:itemCode:regionCode` (codes, not UUIDs)
- `start_period`, `end_period`, `normalize`, `base_period` (same as timeseries)

Response: same shape as `/api/timeseries`.

## GET /api/alerts

Query: `threshold_mom` (default 5.0), `threshold_yoy` (default 10.0), `limit` (default 20)

Response `data`:
```json
{ "alerts": [ { "item_name": "...", "region_name": "...", "period": "2026-06", "mom_rate": 2.1, "yoy_rate": 12.3, "reason": "前年比10%以上", "priority": "high|medium|low" } ] }
```

Priority: high = |yoy|>=20, medium = |yoy|>=10 or |mom|>=5, low = 3+ consecutive months same direction.

## Data sources

GET `/api/data-sources` response `data`:
```json
{ "data_sources": [ { "id": "uuid", "source_code": "MLIT_STAT", "source_name": "国土交通省 統計", "source_type": "material", "provider_name": "国土交通省", "source_url": "https://...", "file_format": "csv", "update_frequency": "monthly", "license_note": "...", "is_active": true, "last_fetched_at": null } ] }
```

POST `/api/data-sources` body (admin): `{ source_code, source_name, source_type, provider_name, source_url?, file_format?, update_frequency?, license_note?, is_active? }`

PATCH `/api/data-sources/{id}` body (admin): partial update of the above.

## Fetch jobs

GET `/api/fetch-jobs?status=&limit=50` response `data`:
```json
{ "fetch_jobs": [ { "id": "uuid", "data_source_id": "uuid", "data_source_name": "...", "job_type": "manual_upload", "status": "success", "file_name": "sample.csv", "file_hash": "sha256:...", "total_rows": 120, "success_rows": 118, "error_rows": 2, "error_detail": [{ "row": 5, "column": "value", "reason": "数値変換失敗" }], "started_at": "...", "finished_at": "..." } ] }
```

## POST /api/fetch-jobs

POST `/api/fetch-jobs` body (admin): `{ "data_source_id": "uuid", "url": "https://..." }`.
`url` is optional when the data source has `source_url`. Downloads CSV/Excel (max 10MB,
30s timeout, SSRF guard), dedupes by SHA-256, and ingests via the same transform as uploads.
For source code `ESTAT_MATERIAL_SUPPLY`, the e-Stat 表-2 workbook is auto-converted to
national-average monthly rows before ingestion.

## POST /api/uploads

Multipart form: `file` (csv/xlsx), `data_source_id` (uuid). Admin endpoint.

Response `data`: same shape as a fetch-job record. Behavior: file hash dedupe (conflict on duplicate), parse → normalize → upsert `time_series_values`, record `source_files` + `transform_logs`.

CSV accepted columns (flexible, Japanese/English headers): 年月/period, 品目/item, 地域/region, 値/value, 単位/unit, 状態/status, 注記/note. Values are matched to item/region masters by code or name; unmapped rows are recorded as errors.

## GET /api/export/csv

Query: same as `/api/timeseries`. Returns `text/csv; charset=utf-8` with UTF-8 BOM and Japanese column names: 年月, データ分類, 品目, 地域, 値, 単位, 前月比, 前年比, 状態, 出典, 取得日時.

## POST /api/export/report

Body: `{ "title": string, "conditions": { ... }, "note": string }`. Returns a minimal PDF (`application/pdf`) containing title, conditions, source note, generated-at. Optional feature; may return `501 NOT_IMPLEMENTED` when PDF library is unavailable.
