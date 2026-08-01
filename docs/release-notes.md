# リリースノート

## Unreleased（作業ブランチ: 公式データソース取込対応）

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
