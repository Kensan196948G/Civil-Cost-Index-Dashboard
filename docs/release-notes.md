# リリースノート

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
