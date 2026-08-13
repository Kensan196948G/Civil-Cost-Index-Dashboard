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
Additional MVP runtime behavior:

- Protected endpoints require a viewer or stronger role unless `ALLOW_ANONYMOUS_VIEWER=true` is explicitly set for a demo environment.
- API responses include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.
- `RATE_LIMIT_PER_MINUTE` applies an in-memory IP-based per-minute request cap in the API runtime. Exceeding it returns `429 RATE_LIMITED`.

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
| GET | `/api/export/xlsx` | Excel export（概要／明細／出典の3シート・データ種別・積算利用可否付き） |
| GET | `/api/export/pdf` | PDF report（日本語フォント埋め込み） |
| GET | `/api/export/pptx` | PowerPoint report（概要＋系列別スライド） |
| GET | `/api/export/estimate-link` | 積算連携Excel（単価候補・根拠・改定差分・スナップショット） |
| POST | `/api/export/report` | PDF report（standalone互換ボディ） |
| GET | `/api/port-models/vessels` | 港湾作業船マスタ（PoC） |
| GET | `/api/port-models/work-types` | 港湾工種・船舶構成（PoC） |
| POST | `/api/port-models/estimate` | 港湾工事コスト試算（PoC） |
| GET | `/api/estimation-bases` | 積算基準一覧（諸経費率付き） |
| POST | `/api/estimation-bases` | 積算基準作成 |
| PATCH | `/api/estimation-bases/{id}` | 積算基準更新 |
| PUT | `/api/estimation-bases/{id}/rates/{rateType}` | 諸経費率登録/更新（common_temp / site_management / general_management） |
| GET | `/api/work-type-trees` | 工種体系一覧（`base_id` 任意） |
| POST | `/api/work-type-trees` | 工種体系作成 |
| GET | `/api/work-breakdowns` | 歩掛一覧（`base_id` / `tree_id` 任意） |
| POST | `/api/work-breakdowns` | 歩掛作成（労務/材料/機械のJSON明細） |
| PATCH | `/api/work-breakdowns/{id}` | 歩掛更新 |
| POST | `/api/work-breakdowns/import` | CSV/Excelで歩掛一括取込（既存システム/書籍エクスポート） |
| GET | `/api/quantities?project_id=` | 案件の数量一覧 |
| POST | `/api/quantities` | 数量追加 |
| PATCH | `/api/quantities/{id}` | 数量更新 |
| DELETE | `/api/quantities/{id}` | 数量削除 |
| POST | `/api/estimates/calculate` | 積算計算（数量×歩掛×単価→諸経費→税） |
| GET | `/api/estimates` | 積算結果一覧（`project_id` 任意） |
| GET | `/api/estimates/{id}` | 積算結果詳細（総括・内訳・単価表） |
| GET | `/api/estimates/{id}/export` | 積算書Excel（総括表/内訳/単価表） |
| POST | `/api/estimates/{id}/submit` | 確認依頼へ提出（draft → review） |
| POST | `/api/estimates/{id}/approve` | 承認・確定（draft/review/confirmed → approved） |
| POST | `/api/estimates/{id}/reject` | 確認依頼を差し戻し（review → draft） |
| POST | `/api/estimates/{id}/supersede` | 変更積算で置き換え（approved/confirmed → superseded、`superseding_id` 必須） |
| POST | `/api/estimates/{id}/confirm` | 旧API: 承認・確定（approve と同等） |
| DELETE | `/api/estimates/{id}` | 積算結果削除 |
| POST | `/api/ai/breakdown-suggest` | AI歩掛選定候補（要承認・金額は計算しない） |
| POST | `/api/vessels/import` | 船舶マスタ一括取込（CSV/Excel・正式係数データ投入） |
| GET | `/api/port-models/sea-conditions` | 海象条件一覧（`sea_area_code` 任意） |
| POST | `/api/port-models/sea-conditions` | 海象条件の登録・更新（海域×月でUPSERT） |
| POST | `/api/port-models/workability` | 海上施工可能日数・稼働率の算定（波高/風速超過時の減算含む） |
| POST | `/api/estimation-bases/{id}/rates/import` | 諸経費率の一括取込（CSV/Excel） |
| GET | `/api/port-models/soil-types` | 土質マスタ（浚渫土質補正係数） |
| POST | `/api/port-models/soil-types` | 土質マスタ登録・更新 |
| GET | `/api/port-models/transport-rates` | 運搬距離別係数マスタ |
| POST | `/api/port-models/transport-rates` | 運搬距離係数登録・更新 |
| GET | `/api/port-models/spoil-grounds` | 土捨場・処分場マスタ |
| POST | `/api/port-models/spoil-grounds` | 土捨場・処分場登録・更新 |
| GET | `/api/port-models/shift-rules` | 補正ルール（夜間/交代制/超勤）一覧 |
| POST | `/api/port-models/shift-rules` | 補正ルール登録・更新 |
| GET | `/api/change-orders` | 設計変更・変更契約一覧（`project_id` 任意） |
| POST | `/api/change-orders` | 変更契約作成（変更前基準年度を保持） |
| GET | `/api/change-orders/{id}` | 変更契約詳細（明細・増減額集計） |
| DELETE | `/api/change-orders/{id}` | 変更契約削除 |
| POST | `/api/change-orders/{id}/lines` | 変更明細追加（変更前後数量・単価から増減額を自動計算） |
| DELETE | `/api/change-orders/{id}/lines/{lineId}` | 変更明細削除 |
| GET | `/api/change-orders/{id}/export` | 差額表Excel（差額集計／変更明細） |
| GET | `/api/estimates/{id}/export.pdf` | 積算書PDF（総括表・内訳・単価表・港湾補足・日本語フォント） |
| GET | `/api/quotations` | 協力会社見積一覧（`project_id` 任意・有効期限ステータス付き） |
| POST | `/api/quotations` | 見積登録（税込/運賃込・正規化条件） |
| GET | `/api/quotations/{id}` | 見積詳細（案件全体の業者間比較・平均比/前回比・警告・採用状態） |
| PATCH | `/api/quotations/{id}` | 見積更新（有効期限・状態など） |
| DELETE | `/api/quotations/{id}` | 見積削除 |
| POST | `/api/quotations/{id}/items` | 見積明細追加 |
| PATCH | `/api/quotations/{id}/items/{itemId}` | 見積明細更新（採用・採用理由・単価） |
| DELETE | `/api/quotations/{id}/items/{itemId}` | 見積明細削除 |
| GET | `/api/quotations/{id}/export` | 見積比較Excel（見積比較／明細） |
| POST | `/api/quantities/ai-extract` | 数量計算書CSV/ExcelのAI候補抽出（工種対応付け・承認フロー） |
| GET | `/api/quantities/ai-suggestions` | AI数量候補一覧（`project_id` / `status` 任意） |
| POST | `/api/quantities/ai-suggestions/{id}/approve` | AI数量候補の承認（quantitiesへ反映） |
| POST | `/api/quantities/ai-suggestions/{id}/reject` | AI数量候補の却下 |
| GET | `/api/estimation-bases/apply-check?date=` | 基準年度の自動適用判定（適用可能な承認済み基準） |
| GET | `/api/estimation-bases/{id}/compare?other_id=` | 積算基準の新旧差分（諸経費率・歩掛） |
| POST | `/api/ai/forecast` | 予測シナリオ（参考・計算はコード、AIは説明のみ） |
| POST | `/api/construction-records/import` | 施工実績CSV/Excel一括取込 |
| GET | `/api/construction-records` | 施工実績一覧（`item_id` / `region_id` / `project_id`） |
| POST | `/api/construction-records` | 施工実績登録 |
| DELETE | `/api/construction-records/{id}` | 施工実績削除 |
| GET | `/api/construction-records/summary` | 実績単価サマリー（平均・中央値・範囲） |
| POST | `/api/construction-records/suggest-price` | 実績中央値から採用単価候補（下書き単価版）を作成 |
| POST | `/api/ai/drawing-extract` | 図面OCRによる数量候補抽出（Vision対応: Anthropicのみ・候補は要承認） |
| GET | `/api/reports/management.pdf` | 経営会議向け総括PDF |
| GET | `/api/reports/management.pptx` | 経営会議向け総括PowerPoint |
| GET | `/api/reports/management.json` | 経営KPIデータ（案件別粗利・港湾稼働率・採用単価対実績） |
| GET | `/api/port-models/readiness` | 港湾積算の運用準備状況チェック |
| GET | `/api/port-models/validate-coefficients` | 港湾係数データの照合検証（損料・歩掛・諸経費率・海象・土質/運搬/土捨場） |
| POST | `/api/rag/index` | RAG索引の再構築（積算基準・歩掛・過去案件をpgvectorへ） |
| POST | `/api/rag/search` | ベクトル類似検索 |
| POST | `/api/rag/ask` | 根拠付きAI回答（引用番号付き・要監査ログ） |
| POST | `/api/ai/quotation-review/{id}` | 見積比較からAI査定コメント生成（候補・要承認） |
| POST | `/api/ai/forecast/evaluate` | 予測の実績値記録・誤差率算定 |
| GET | `/api/ai/forecast/evaluations` | 予測実績誤差の履歴（データ充足度含む） |
| POST | `/api/ai/test-key` | DeepSeek APIキーの設定テスト（サーバー設定と一致＋疎通確認） |

`GET /api/ai/audit` は管理者キー（`X-Admin-Key`）またはサーバーに設定されたDeepSeek APIキー
（`X-AI-Key`）が一致する場合に閲覧できます。

`/api/reports/management.*` は `?audience=executive|estimator|sales` でハイライトを変更できます。
AI候補（数量・歩掛・査定・図面OCR）の生成時は Teams/Slack に承認依頼が通知されます
（`NOTIFY_TEAMS_URL` / `NOTIFY_SLACK_URL` 未設定時は `notifications_log` に skipped として記録）。
タスク別ルーティングは `AI_ROUTING`（JSON）で指定します（例: `{"summary":"deepseek","report":"anthropic"}`）。
| GET | `/api/auth/me` | 現在の認証情報（メール・役割・認証元） |
| GET | `/api/users` | ユーザー一覧（system_admin） |
| POST | `/api/users` | ユーザー作成（system_admin） |
| PATCH | `/api/users/{id}` | ユーザー更新・役割変更（system_admin） |
| GET | `/api/audit/operations` | 操作監査ログ（auditor / system_admin） |
| GET | `/api/price-versions` | 単価版一覧 |
| POST | `/api/price-versions` | 単価版（下書き）作成 |
| PATCH | `/api/price-versions/{id}` | 単価版更新（下書きのみ） |
| POST | `/api/price-versions/{id}/approve` | 単価版承認（data_approver / estimating_manager / system_admin） |
| POST | `/api/price-versions/{id}/retire` | 単価版失効 |
| GET | `/api/price-versions/{id}/compare` | 旧版との比較（`old_id` 任意） |
| GET | `/api/price-snapshots` | スナップショット一覧 |
| POST | `/api/price-snapshots` | 承認済み単価からスナップショット作成 |
| GET | `/api/price-snapshots/{id}` | スナップショット明細 |
| GET | `/api/fetch-schedules` | 定期取得スケジュール一覧 |
| POST | `/api/fetch-schedules` | スケジュール作成 |
| PATCH | `/api/fetch-schedules/{id}` | スケジュール更新 |
| POST | `/api/fetch-schedules/{id}/run` | スケジュール即時実行 |
| GET | `/api/staged-ingestions` | 承認待ちデータ一覧 |
| POST | `/api/staged-ingestions/{id}/approve` | 承認して本番反映 |
| POST | `/api/staged-ingestions/{id}/reject` | 却下 |
| GET | `/api/projects` | 案件一覧 |
| POST | `/api/projects` | 案件作成 |
| GET | `/api/projects/{id}` | 案件詳細（明細付き） |
| PATCH | `/api/projects/{id}` | 案件更新 |
| DELETE | `/api/projects/{id}` | 案件削除 |
| POST | `/api/projects/{id}/items` | 案件明細追加 |
| PATCH | `/api/projects/{id}/items/{itemId}` | 案件明細更新 |
| DELETE | `/api/projects/{id}/items/{itemId}` | 案件明細削除 |
| POST | `/api/projects/{id}/simulate` | 価格影響シミュレーション |
| DELETE | `/api/users/{id}` | ユーザー削除（system_admin） |
| DELETE | `/api/price-versions/{id}` | 単価版削除（estimating_manager / system_admin） |
| DELETE | `/api/price-snapshots/{id}` | スナップショット削除 |
| DELETE | `/api/fetch-schedules/{id}` | スケジュール削除 |
| DELETE | `/api/staged-ingestions/{id}` | 承認待ちデータ削除 |

Admin endpoints require `X-Admin-Key: <ADMIN_API_KEY>` when `ADMIN_API_KEY` is configured.
RBAC を有効化すると、`CF-Access-Jwt-Assertion`（Cloudflare Access）のメールアドレスで
`users` テーブルの役割を参照します。役割: viewer / data_ingester / data_approver / estimator /
estimating_manager / auditor / system_admin。

## GET /api/regions

Response `data`:
```json
{ "regions": [ { "id": "uuid", "region_code": "JP-01", "region_name": "全国", "region_type": "national", "parent_region_id": null, "display_order": 1, "is_active": true } ] }
```

## GET /api/items

Query: `category` (optional: MATERIAL_PRICE / LABOR_COST / PRICE_INDEX / FUEL_PRICE / OTHER)

Response `data`（`data_kind` / `estimate_usable` は migration 005 以降）:
```json
{ "items": [ { "id": "uuid", "item_code": "STEEL_H", "item_name": "H形鋼", "category": "MATERIAL_PRICE", "sub_category": "鋼材", "standard_name": "SS400 H-200x100", "default_unit": "円/t", "data_kind": "actual_price", "estimate_usable": true, "display_order": 1, "is_active": true } ] }
```

`data_kind`: `actual_price`（実単価）/ `official_index`（公的指数）/ `trend_assessment`（動向評価値・参考のみ）/ `internal_actual`（社内実績単価）/ `adopted_price`（採用単価）。
`estimate_usable: false` の系列は積算の単価根拠に使用できません。

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
      "data_kind": "actual_price",
      "estimate_usable": true,
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
{ "data_sources": [ { "id": "uuid", "source_code": "MLIT_STAT", "source_name": "国土交通省 統計", "source_type": "material", "provider_name": "国土交通省", "source_url": "https://...", "file_format": "csv", "update_frequency": "monthly", "license_note": "...", "data_kind": "actual_price", "estimate_usable": true, "redistribution_note": "...", "is_active": true, "last_fetched_at": null } ] }
```

POST `/api/data-sources` body (admin): `{ source_code, source_name, source_type, provider_name, source_url?, file_format?, update_frequency?, license_note?, data_kind?, estimate_usable?, redistribution_note?, is_active? }`

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

## GET /api/export/xlsx

Query: same as `/api/timeseries`. Returns `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
シート構成: 概要（出力条件・注意事項）／明細（データ種別・積算利用可否を含む）／出典（URL・ライセンス・再配布注記）。

## GET /api/export/pdf

Query: same as `/api/timeseries`. 日本語フォントをサーバー側で取得・埋め込みます。
フォントURLは環境変数 `PDF_CJK_FONT_URL`（TTF/OTF）で指定可能。未設定時はデフォルトCDNを使用し、
取得できない場合は 502 と設定案を返します。

## GET /api/export/pptx

Query: same as `/api/timeseries`. 概要スライド＋系列別スライド（年月・値・前月比・前年比・状態）を返します。

## GET /api/export/estimate-link

Query: `snapshot_id`（任意）。承認済み単価版を「品目コード・出典・適用期間・税込/税抜・運賃込み/別」付きで
出力し、既存積算システム／Excelテンプレートへの受け渡しに使います。シート: 単価候補／改定差分／
スナップショット（指定時）／注意事項。

## POST /api/port-models/estimate

Body: `{ work_type_id, quantity, operation_rate?, mobilization_days? }`

PoC用の簡易モデルです。作業船ごとに:
- 1日能力 = 能力 × 稼働率
- 稼働日数 = ceil(数量 × 単位あたり船日 ÷ 1日能力)
- 待機日数 = ceil(稼働日数 × (1 - 供用係数))
- 損料 = (稼働日数 + 待機日数) × 損料単価、回航費 = 回航日数 × 損料単価

結果には算定前提が添付されます。正式な港湾積算基準（令和8年度）の係数に置き換える必要があります。

## POST /api/estimates/calculate（港湾）

`port_options` を指定すると港湾3工種（浚渫/ケーソン/基礎捨石）の船舶損料・供用係数・
拘束費・回航費を自動算定します。

```json
{
  "project_id": "uuid",
  "base_id": "uuid（PORT-2026）",
  "name": "本工事積算",
  "port_options": {
    "operation_rate": 0.7,
    "mobilization_days": 3,
    "soil_correction": 0.1,
    "night_surcharge": 0.05
  }
}
```

計算式: 稼働日数 = ceil(数量 × 船日/単位 ÷ (船舶能力 × 稼働率))、
待機日数 = ceil(稼働日数 × (1 - 供用係数))、船舶損料 = (稼働日数+待機日数) × 損料単価、
回航・えい航費 = 回航日数 × 損料単価。土質補正・夜間補正は直接工事費へ適用され、
結果は `estimate.port_options` / `estimate.port_extras` に保存されます。

浚渫では `soil_type_code` / `spoil_ground_code` / `transport_distance_km` を指定すると、
土質補正係数・土捨場の処分単価・運搬距離係数をマスタから自動解決して直接工事費へ反映します。
`port_extras` に `soil_factor` / `transport_coefficient` / `disposal_cost` が保存されます。

`shift_rules`（例: `["NIGHT_22_05","ROTATION_2"]`）を指定すると、労務・機械の割増率を
ルールマスタから合算して適用します。結果は `port_extras.shift_labor_surcharge` /
`shift_machinery_surcharge` / `shift_rules` に保存されます。

## POST /api/projects/{id}/simulate

Body:
```json
{
  "scenarios": [
    { "name": "下振れ", "delta": -0.1 },
    { "name": "標準", "delta": 0 },
    { "name": "上振れ", "delta": 0.1 }
  ],
  "index_item_id": "uuid（任意: 公的指数の品目）",
  "base_period": "2025-01"
}
```

計算式: 影響額 = 数量 × 基準単価 × 適用変動率。
`index_item_id` 指定時は基準年月→調達予定月の実データ変動率にシナリオ係数を加算します。
データ不足時はシナリオ係数のみで計算し `warnings` に明記します。

## 定期取得（Cloudflare Cron）

Worker の Cron トリガー（毎日 16:00 UTC = 01:00 JST）で `scheduled` ハンドラが起動し、
`fetch_schedules` のうち `next_run_at` が到来したスケジュールを実行します。
`approval_required = true` の場合は `staged_ingestions`（承認待ち）に保存し、
`POST /api/staged-ingestions/{id}/approve` で本番反映します。
未更新・取得失敗は `notify_channels`（teams / slack）へ Webhook 通知されます
（環境変数: `NOTIFY_TEAMS_URL` / `NOTIFY_SLACK_URL`）。

## POST /api/export/report

Body: `{ "title": string, "conditions": { ... }, "note": string }`. Returns a minimal PDF (`application/pdf`) containing title, conditions, source note, generated-at. Optional feature; may return `501 NOT_IMPLEMENTED` when PDF library is unavailable.
