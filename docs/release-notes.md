# リリースノート

## Unreleased（2026-08-31: Local PostgreSQL運用の再現性）

- LAN業務データ正本として`pgvector/pgvector:pg17`をDocker Composeへ追加
- API起動前にMigration/Seedを完了し、`schema_migrations`へファイル名・SHA-256・適用日時を記録
- CIのAPI Testを実PostgreSQL Integrationへ変更し、Migration再実行も検証
- Local PostgreSQLの論理Backupと別名DBへのRestore drill Scriptを追加
- SheetJSを公式配布`0.20.3`へ更新し、Prototype Pollution/ReDoSのHigh advisoryを解消
- Cloudflare Worker + Neonは互換経路として維持し、自動同期やProduction切替は対象外

## Unreleased（2026-08-05: AI管理のDeepSeekキー設定と監査ログ閲覧）

- `/admin/ai` に「DeepSeek APIキー設定」パネルを追加
  - APIキー入力欄／設定テスト／設定保存／リセット
  - 設定テストは `POST /api/ai/test-key`（サーバー設定キーとの一致＋DeepSeek API疎通確認）
- AI利用監査ログは、管理者キーがなくても**サーバーに設定されたDeepSeek APIキー（X-AI-Key）が有効なら閲覧可能**に変更
- 監査ログのデータエクスポートは後日相談（未実装のまま）
- テスト138件 PASS / Workerビルド成功

## Unreleased（2026-08-05: ルーティング・承認通知・照合検証・利用者別KPI）

- AIプロバイダールーティング: `AI_ROUTING`（JSON）でタスク種別ごとにAnthropic/DeepSeek/Perplexity/Workers AIを自動選択。未設定プロバイダーへは既定優先順位へフォールバック
- AI候補の承認依頼通知: 数量AI・歩掛AI・査定AI・図面OCRの候補生成時にTeams/Slackへ通知（未設定時はnotifications_logにskipped記録）
- 港湾係数の照合検証: `GET /api/port-models/validate-coefficients`（損料・供用係数・歩掛・諸経費率・海象・土質/運搬/土捨場を検証）
- 利用者別経営KPI: `management.*?audience=executive|estimator|sales`（ハイライト切替）。`/admin/management` に利用者セレクタを追加
- テスト137件 PASS / Workerビルド成功

## Unreleased（2026-08-05: RAG・AI査定・予測評価・運用準備・経営KPI）

- RAG・自然言語検索（migration 017）
  - `document_chunks`（pgvector 384次元・HNSW索引）に積算基準・歩掛・過去案件を索引化
  - 埋め込み: Workers AI優先・オフライン時は決定論的ハッシュ埋め込みへフォールバック
  - `POST /api/rag/ask` は根拠資料（引用番号・類似度）付きでAI回答（DeepSeek等）を生成し監査ログへ保存
- AI見積査定コメント: `POST /api/ai/quotation-review/{id}`（DeepSeekで査定コメント・推奨を生成→ai_suggestionsで承認）
- 予測の実績誤差評価: `forecast_evaluations`（予測値・実績値・誤差率・データ充足度）。`POST /api/ai/forecast/evaluate` で記録
- 港湾積算の運用準備チェック: `GET /api/port-models/readiness`（船舶・工種・歩掛・海象・諸経費率・土質/運搬/土捨場の充足判定）
- 経営KPI拡張: 案件別粗利（積算額−ベース額）・港湾稼働率平均・採用単価対実績中央値。PDF/PPTXにも反映、`management.json` と `/admin/management` 画面を追加
- Web: /ai にRAG検索・予測実績評価、/admin/quotations にAI査定コメント、/port に準備状況、/admin/management にKPIを追加
- テスト135件 PASS / Workerビルド成功

## Unreleased（2026-08-05: 図面OCRの本格評価基盤）

- 合成図面PNG生成スクリプト（`apps/api/scripts/generate-synthetic-drawings.mjs`・依存ゼロ・ビットマップフォント）
  - 寸法（W/D/H）と数量（VOL）が既知の平面図・断面図を10件生成し、正解ラベルCSVを出力
- 精度評価スクリプト（`apps/api/scripts/evaluate-drawing-ocr.mjs`）
  - `/api/ai/drawing-extract`（Anthropic Vision）で数量候補を抽出し、細別一致率・数量誤差中央値を判定
  - 受入基準: 細別一致率90%以上・数量誤差±5%以内
- `data/samples/drawings/` に合成サンプル10件を追加

## Unreleased（2026-08-05: 基準差分・予測・施工実績・図面OCR・経営レポート）

- 積算基準の新旧差分（`/api/estimation-bases/{id}/compare`）と基準年度の自動適用判定（`apply-check`）
- 予測シナリオ（`/api/ai/forecast`）: 統計はコード計算、AIは説明のみ（現状維持/緩やかな上昇/急騰/下落・参考レンジ）
- 施工実績データ（migration 015）: 取込・一覧・実績単価サマリー・実績中央値からの採用単価候補（下書き）作成
- 港湾版諸経費率（migration 016）: PORT-2026 に共通仮設15%・現場管理18%・一般管理10%を適用期間付きで登録
- 図面OCR（`/api/ai/drawing-extract`）: Anthropic Visionで数量候補を抽出し、承認フローへ連携
- 経営会議向けレポート（`/api/reports/management.pdf` / `.pptx`）
- Web: 基準比較・適用判定／予測シナリオ（/ai）／施工実績データ画面／図面OCR取込／経営レポート出力
- テスト132件 PASS / Workerビルド成功

## Unreleased（2026-08-05: Phase 6 数量計算書ExcelのAI取込）

- `POST /api/quantities/ai-extract`: 数量計算書CSV/Excelから工種体系へ「コード一致→名称一致→類似名称→AI対応付け」で候補を生成
- 候補は `ai_suggestions`（`quantity_extraction`）に保存し、承認→`quantities`反映／却下→破棄（承認フロー）
- AI（DeepSeek等）は候補と理由のみ生成し、数量・金額は確定しない
- `GET /api/quantities/ai-suggestions`・承認/却下APIを追加
- `/admin/quantities` に「AI数量取込」セクション（抽出・候補一覧・承認/却下）を追加
- 評価基盤: `data/samples/quantity_sheet_sample.csv`（正解ラベル付き10行）、
  `scripts/generate-quantity-samples.mjs`、`scripts/evaluate-ai-extraction.mjs`（細別一致率90%以上でPASS）、
  `docs/quantity-ai-evaluation.md`
- テスト128件 PASS / Workerビルド成功

## Unreleased（2026-08-05: 見積比較・査定支援）

- migration `014_quotations.sql`: `quotations` / `quotation_items`（税込/運賃込・正規化条件・採用/採用理由）
- 見積比較ライブラリ（`lib/quotations.ts`）: 業者間の平均比・最小/最大・±20%警告・前回比（±10%）警告・有効期限判定
- API: 見積CRUD・明細CRUD（採用・採用理由）・見積比較Excel
- Web: `/admin/quotations`（見積一覧・業者間比較・採用・有効期限バッジ・Excel出力）
- テスト127件 PASS / Workerビルド成功

## Unreleased（2026-08-05: 港湾用積算書PDF・設計変更/変更契約差額）

- migration `013_change_orders.sql`: `change_orders` / `change_order_lines`（変更前後数量・単価・基準年度を保持）
- 差額計算ライブラリ（`lib/changeOrder.ts`）: 数量差・増減額・増額/減額/差額の集計
- API: 変更契約のCRUD・変更明細（自動計算）・差額表Excel
- 積算書PDF: `GET /api/estimates/{id}/export.pdf`（総括表・内訳・単価表・港湾補足・日本語フォント埋め込み）
- Web: `/admin/change-orders`（変更契約・明細・差額集計・Excel出力）、`/estimates` に積算書PDF出力を追加
- テスト123件 PASS / Workerビルド成功

## Unreleased（2026-08-05: 夜間施工・交代制・超勤補正）

- migration `012_shift_rules.sql`: `work_shift_rules`（種別・時間帯・労務/機械の割増率・適用条件）とサンプル3件（夜間22-5時、交代制2班、超勤2時間）
- 積算エンジン: `shift_rules` を指定すると労務・機械の割増率を合算して直接工事費へ適用
- API: `/api/port-models/shift-rules`（一覧・登録・更新）
- `/estimates`: 港湾オプションに補正ルールの複数選択を追加
- `/port`: 補正ルールマスタの一覧と登録を追加
- テスト119件 PASS / Workerビルド成功

## Unreleased（2026-08-05: 土質・浚渫土量・運搬距離・土捨場/処分費）

- migration `011_dredging_conditions.sql`
  - `soil_types`（浚渫土質補正係数・サンプル6種）
  - `dredging_transport_rates`（運搬距離別係数・サンプル5段階）
  - `spoil_grounds`（土捨場・処分場の処分単価・サンプル3件）
- 積算エンジン: 浚渫時の土質補正係数・運搬距離係数を直接工事費へ乗算し、処分費 = 浚渫土量 × 処分単価を加算
- API: 土質／運搬距離／土捨場マスタの一覧・登録・更新
- `/estimates`: 港湾オプションに土質・土捨場・運搬距離を追加（マスタから自動解決）
- `/port`: 浚渫条件マスタの一覧と登録を追加
- テスト118件 PASS / Workerビルド成功

## Unreleased（2026-08-05: 正式係数データ投入・海象条件）

- migration `010_sea_conditions.sql`: `port_sea_conditions`（海域×月の施工可能日数・作業限界波高/風速・航路制限）とサンプル海域（東京湾/大阪湾/伊勢湾）を追加
- 係数データ投入（3経路）
  - `POST /api/vessels/import`: 船舶マスタ（損料・供用係数・回航日数・待機率）のCSV/Excel一括取込
  - `POST /api/estimation-bases/{id}/rates/import`: 諸経費率の一括取込（パーセント表記も自動変換）
  - 歩掛の取込は既存の `/api/work-breakdowns/import` を使用
  - 標準テンプレートを `data/samples/` に追加、手順書 `docs/coefficient-import.md` を新設
- 海象条件・施工可能日数
  - `GET/POST /api/port-models/sea-conditions`（登録・更新）
  - `POST /api/port-models/workability`: 施工可能日数 → 稼働率の算定（波高・風速が作業限界を超えた場合は日数を減算し警告）
  - `/estimates` の港湾オプションで海域・施工予定月を選ぶと稼働率を自動設定
  - `/port` に海象条件一覧・算定・登録と船舶マスタ取込を追加
- テスト117件 PASS / Workerビルド成功

## Unreleased（2026-08-05: Phase 5 港湾3工種の積算エンジン対応）

- migration `009_port_estimating.sql`
  - `estimate_headers` に `port_options` / `port_extras` を追加
  - PORT-2026 基準に浚渫工（DREDGING）・ケーソン製作・据付（CAISSON）・基礎捨石・被覆消波（RUBBLE_BASE）の工種・歩掛を追加
  - 歩掛の機械明細に `vessel_id` を設定し、船舶マスタ（損料・供用係数・回航日数・待機率）を参照
- 積算エンジンに港湾計算を追加
  - 稼働日数 = ceil(数量 × 船日/単位 ÷ (船舶能力 × 稼働率))
  - 待機・拘束日数 = ceil(稼働日数 × (1 - 供用係数))
  - 船舶損料・回航/えい航費を自動算定し、土質補正・夜間/交代制補正に対応
  - 結果は `port_options` / `port_extras` として積算書Excel「港湾補足」シートにも出力
- Web: `/estimates` で港湾基準選択時に稼働率・回航日数・土質補正・夜間補正を入力可能
- テスト115件 PASS / Workerビルド成功

## Unreleased（2026-08-05: Phase 4 積算エンジン土台）

- migration `008_estimating.sql`
  - `estimation_bases`（基準・年度・適用日・端数規則・データ経路）
  - `work_type_trees`（工種/区分子/細別/規格）
  - `quantities`（案件の数量計算書・施工条件）
  - `work_breakdowns`（労務/材料/機械の歩掛JSON・条件付き）
  - `overhead_rates`（共通仮設費/現場管理費/一般管理費等率）
  - `estimate_headers` / `estimate_lines` / `estimate_materials`（積算結果）
  - `ai_suggestions`（AI候補の監査・承認基盤）
  - サンプル基準（MLIT-2026 / PORT-2026）と土工・コンクリート工・舗装工の工種体系・歩掛
- 積算計算エンジン（`lib/estimating.ts`・純粋関数）
  - 数量×歩掛明細×単価 → 直接工事費 → 共通仮設費 → 現場管理費 → 一般管理費等 → 消費税
  - 積算基準ごとの端数処理（円/十円/百円/千円の切捨・四捨五入・切上）
- API: 基準/工種/歩掛/数量/積算計算/積算書Excel/AI歩掛候補（`/api/ai/breakdown-suggest`）
- Web: `/admin/estimation-bases`（基準・諸経費）、`/admin/breakdowns`（工種・歩掛・CSV/Excel取込）、
  `/admin/quantities`（数量計算書）、`/estimates`（積算計算・総括表/内訳/単価表・AI候補）
- AI歩掛選定は候補提示のみ（DeepSeek等で生成・ルールフォールバック）。金額はコードのみが計算
- テスト113件 PASS / Workerビルド成功

## Unreleased（2026-08-05: AIプロバイダー拡張）

- DeepSeek（`DEEPSEEK_API_KEY`・`deepseek-chat`）と Perplexity（`PERPLEXITY_API_KEY`・`sonar`）をAIプロバイダーへ追加
- OpenAI互換の chat completions API に対応し、`AI_PROVIDER` で強制指定可能
- プロバイダー優先順位（未指定時）: Anthropic → DeepSeek → Perplexity → Workers AI → ルール生成
- `/api/ai/status` に `providers`（設定状況・モデル一覧）と `provider_label` を追加
- テスト106件 PASS / Workerビルド成功

## Unreleased（2026-08-05: シークレット同期スクリプト）

- `scripts/sync-secrets.mjs` を追加
  - `apps/api/.secrets.env`（または `.dev.vars`）にキーを置くだけで反映
  - Cloudflare: `wrangler secret put` → `wrangler deploy` → `/api/ai/status` 確認まで自動化
  - 本機LAN: `/etc/cci/cci.env` へ反映 → `systemctl restart cci` → 確認まで自動化
  - `--dry-run` で事前確認可能
- npm scripts: `secrets:cloudflare` / `secrets:local` / `secrets:sync`

## Unreleased（2026-08-05: 本機LANの環境変数転送修正）

- `server.ts` が新規オプション環境変数（DEEPSEEK / PERPLEXITY / NOTIFY / CF_ACCESS / PDF_CJK / AUTH_TRUST_PROXY）を
  Node実行時に転送していなかった問題を修正
- `docker-compose.yml` / `infra/systemd/install.sh` に全オプション環境変数の転送を追加
- `sync-secrets.mjs` のローカル反映が権限不足の場合、`sudo npm run secrets:local` を案内して終了するよう改善

## Unreleased（2026-08-05: 残タスク対応・ルートReact化）

前日の対応で残った項目を実装。

### 修正（2026-08-05: ログイン後の白画面）

- Next.js 静的エクスポートのルートHTMLはRSCペイロードを**インラインスクリプト**で配信するため、
  `script-src 'self'` の厳格CSPではブラウザが全スクリプトをブロックし白画面になる問題を修正
- `_headers` の React ページ全パスに `script-src 'unsafe-inline'` を追加（`unsafe-eval` は許可しない）

### 追加・修正

- **テストデータ削除**
  - ユーザー／単価版／スナップショット／スケジュール／承認待ちデータの DELETE API を追加
  - スモークテストが作成したデータを後始末（作成→削除）するよう変更し、既存のテスト残骸をDBから削除
- **Phase 3: 積算連携Excel**
  - `GET /api/export/estimate-link`（単価候補・根拠・改定差分・スナップショットの受け渡しシート）
  - レポート出力画面・単価版管理画面に出力ボタンを追加
- **PDF / PowerPoint出力（サーバーサイド）**
  - `GET /api/export/pdf`（pdf-lib + 日本語フォント埋め込み。`PDF_CJK_FONT_URL` で差替可能）
  - `POST /api/export/report` を PDF生成に実装（standalone互換）
  - `GET /api/export/pptx`（最小ZIPライターによる OOXML 生成・日本語テキスト対応）
- **港湾工事コストモデル（PoC）**
  - migration `007_port_cost_model.sql`（作業船マスタ・工種3種・船舶構成）
  - `POST /api/port-models/estimate`（損料・稼働率・待機費・回航費の簡易試算。前提を明示）
  - 画面 `/port`
- **ルート「/」のReact WebUI化・CSP厳格化**（commit 31a3d36 にて対応済み）
  - standalone は `/standalone.html` のみ。ルートの `unsafe-eval` は廃止

### 検証

- API: typecheck / lint / テスト98件（港湾PoC・PDF・PPTX・積算連携・削除API含む）PASS
- Web: typecheck / lint / テスト PASS

## Unreleased（2026-08-04: 優先度A・案件影響分析の実装）

外部評価の優先度A（単価版管理・RBAC・定期取得/通知）と3段階導入のPhase 2（案件影響分析）を実装。

### 追加

- **RBAC・承認基盤**
  - `users` テーブルと7役割（閲覧者／データ取込担当／データ承認者／積算担当／積算責任者／監査者／システム管理者）
  - Cloudflare Access JWT（`CF-Access-Jwt-Assertion`）の署名検証・メール照合（`CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`）
  - 操作監査ログ `operation_audit_logs`（誰が何を変更したかを個人単位で記録）
  - `/api/auth/me`・ユーザー管理API・管理画面（`/admin/users`・`/admin/audit`）
- **単価版管理・スナップショット**
  - `price_versions`（適用開始/終了日・公表日・改定日・遡及改定・荷渡し条件・税込/税抜・運賃込み/別・旧版リンク）
  - 下書き→承認→失効のワークフロー（承認はデータ承認者・積算責任者）
  - `price_snapshots`（積算時点で承認済み単価を固定）
  - 管理画面 `/admin/price-versions`（旧版比較・承認・スナップショット作成）
- **定期取得・更新通知・承認待ち**
  - `fetch_schedules` と Cloudflare Cron（毎日 01:00 JST）
  - 取得結果はデフォルトで `staged_ingestions`（承認待ち）→ 承認後に本番反映
  - 未更新・取得失敗・重複を Teams / Slack へ Webhook 通知（`NOTIFY_TEAMS_URL` / `NOTIFY_SLACK_URL`）
  - 管理画面 `/admin/schedules`・`/admin/staged`
- **案件別価格影響分析（Phase 2）**
  - `projects` / `project_items`（案件名・発注者・工種・地域・入札/契約/施工日・数量・基準単価・調達予定月）
  - `POST /api/projects/{id}/simulate`（影響額 = 数量 × 基準単価 × 変動率、下振れ/標準/上振れ、公的指数の実変動率加算、月別集計）
  - 画面 `/projects`
- migration `006_priority_a.sql`

### 検証

- API: typecheck / lint / テスト90件（auth・scheduler・単価版・案件・スケジュールのスモーク含む）PASS
- Web: typecheck / lint / テスト PASS

### 設定が必要な環境変数（任意）

- `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`（Cloudflare Access連携）
- `NOTIFY_TEAMS_URL` / `NOTIFY_SLACK_URL`（通知）
- `AUTH_TRUST_PROXY=true`（リバースプロキシ運用時に `X-User-Email` / `X-User-Roles` を信頼）

## Unreleased（2026-08-04: 外部評価対応）

外部評価（2026-08-04）の検証結果に基づく対応。

### 追加・修正

- 主要建設資材需給・価格動向調査の提供元を「経済産業省」→「国土交通省」へ修正
  - README / データ取得手順書 / 管理画面プリセット / migration 005 による既存DB補正
- データ種別（実単価／公的指数／動向評価値／社内実績／採用単価）と積算利用可否を DB・API・画面に追加
  - 動向評価値（1〜5段階）は「参考のみ」として明示し、積算の単価根拠から除外
  - migration 005（`items` / `data_sources` / `time_series_values` に `data_kind` / `estimate_usable` 追加）
- システムの位置付けを「建設コスト・市況分析基盤（積算判断支援）」と README・要件定義書に明記
- Excel出力（`GET /api/export/xlsx`）を実装（概要／明細／出典の3シート・データ種別・積算利用可否・再配布注記付き）
- バックアップ自動化（systemd timer 例）と定期リストア試験の運用要件を手順書へ追加
- 外部評価の検証結果と対応方針を `docs/evaluation-response-2026-08-04.md` に整備

### 未対応（ロードマップへ移行）

- 案件別価格影響シミュレーション（Phase 4）
- 単価版管理（適用開始日・遡及改定・スナップショット）
- RBAC／SSO連携（現在は X-Admin-Key）
- 定期取得・更新通知（Cron / Teams / Slack / メール）
- 港湾工事コストモデル（作業船・損料・回航・海象条件等）
- PDFレポート・PowerPoint出力
- standalone画面の React 置換（CSP の unsafe-eval 解消）

## Unreleased（作業ブランチ: 公式データソース取込対応）

## Unreleased（2026-08-01: ccid ドメイン設定）

- サブドメインを `ccid.mirai-dx-platform.com` に決定
- Workers カスタムドメイン（cci-web-assets）＋DNS（AAAA 100::）を GitHub Actions の `Deploy Cloudflare (manual)` で冪等管理（configure-domain ジョブ）
- API Worker の CORS_ORIGINS に ccid ドメインを追加
- ルート「/」を standalone HTML へサーバー内 rewrite（LAN Docker 運用向け・リダイレクトなし）
- Cloudflare Access は利用者側で適用予定（適用前は一般公開）

## Unreleased（2026-08-01: Cloudflare 上で Unpacking 停止の修正）

- 原因: `_headers` の厳格 CSP（`script-src 'self'`）が standalone バンドルのインライン/Blob/評価スクリプトをブロック
- 対応: standalone パス（`/`・`/standalone.html`・`/index.html`）に限り CSP を緩和（`unsafe-inline` `unsafe-eval` `blob:` `data:`、`frame-src blob:`、`frame-ancestors 'self'`）。React 管理画面は厳格 CSP を維持
- 検証: Playwright（Chromium）で `cci-web-assets.kensan1969.workers.dev/` を実ブラウザ確認
  - アプリ描画 PASS / Unpacking 表示消滅 PASS / console errors なし
- ccid.mirai-dx-platform.com は Access 認証後、同一アセットのため正常表示される見込み

### 追加

- データソース管理に公式データソース4件を登録（e-Stat 主要建設資材需給・価格動向調査 / e-Stat 消費者物価指数 / けんせつPlaza / 公共工事設計労務単価）
- URLから直接取得する取込機能（POST /api/fetch-jobs、SSRFガード・10MB制限・SHA-256重複防止）
- e-Stat 主要建設資材需給・価格動向調査（表-2）の専用変換（全国平均値の価格動向指数を月次系列化）
- Excel（xlsx）取込対応（手動アップロード・URL取得の両方）
- Shift_JIS CSV の自動判定・デコード
- 骨材4品目・木材2品目のマスタ追加（migration 003）
- データ取得手順書 `docs/data-acquisition.md` を新設

### 検証結果

- API: lint / typecheck / テスト 47件 PASS / Workerビルド dry-run 成功
- Web: lint / typecheck PASS / Dockerビルド（本番経路）成功
- ローカル `next build` はサンドボックスの仮想メモリ上限（ulimit -v 20GB）による Wasm 確保失敗のため未実施（環境要因・コード起因ではない）

## v0.1.0（2026-07-31）初回本番リリース

### リリース内容

- Cloudflare Workers 上に Hono API を新規デプロイ（`cci-api-production`）
- Next.js 静的エクスポートを Cloudflare Workers アセットとしてデプロイ（`cci-web-assets`）
- Neon PostgreSQL 新規プロビジョニング（`civil-cost-index-dashboard`）
- スキーマ作成・サンプルデータ投入（44行）
- 管理API保護（X-Admin-Key）
- GitHub Actions CI/CD（lint / typecheck / test / build / deploy）
- セキュリティヘッダー・CORS・Workers Observability 設定
- 運用・監視・障害対応・バックアップ手順書を整備

### 実装機能

- トップダッシュボード（KPI・注目変動・更新状況）
- 時系列分析・比較分析（基準年月100指数化）
- データテーブル・CSV出力
- データソース管理・CSV取込・取込履歴
- ユーザー設定（Admin Key / 初期地域）

### 既知の制限

- PDF レポート出力は未実装（API は 501 を返す）
- カスタムドメイン未設定（候補は docs/cloudflare-neon.md 参照。DNS変更なし）
- 自動データ取得（スケジュール取込）は未実装
- Excel（xlsx）取込は未対応
- 外部定期監視・Logpush・アラート通知は未導入
- サンプルデータは公開統計の代替（本番データ投入は今後）

### 検証結果

- API: typecheck / lint / 単体テスト 17件 / 統合スモーク 13件 / ビルド dry-run 成功
- Web: typecheck / lint / テスト 4件 / 静的ビルド成功
- 本番: 全エンドポイント 200 / 管理API 401・409 検証済み / セキュリティヘッダー確認済み

## v0.1.0（2026-08-01 追記: 本番運用開始）

- 利用者指示に基づき、本機（自動割当IP）の Web:3000 / API:18000 で本番稼働開始
- systemd `cci.service` を登録し、機器起動時の自動起動を有効化
- Docker Compose（api/web イメージ）での常駐構成を追加
- Cloudflare Workers（`cci-api-production` / `cci-web-assets`）は一時プレビューとして維持
- サブドメインは後日決定（DNS変更なし）
