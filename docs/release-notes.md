# リリースノート

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
