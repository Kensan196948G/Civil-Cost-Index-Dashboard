# リリースチェックリスト（v0.1.0 Phase 1）

## 1. リリース前チェック

- [x] API: lint / typecheck / テスト174件（Local PostgreSQL Integration含む） / ビルド（Worker dry-run + Node bundle）
- [x] Web: lint / typecheck / テスト4件 / standalone ビルド（Docker・本番経路）
- [x] データ取込: CSV/Excel 手動取込・URL取得・e-Stat 主要建設資材（表-2）専用変換・Shift_JIS 対応
- [x] Production依存監査: API/Webともnpm audit 0件（SheetJS 0.20.3を含む）
- [x] 秘密・接続文字列・PII のリポジトリ/履歴露出なし（プレースホルダのみ）
- [x] API 異常系: 401 / 409 / 400 / 501 / 404 を確認
- [x] E2E（Playwright・Docker）: 29/29 PASS（全8画面・モバイル375px・a11y基本・console errorなし）
- [x] 空Local PostgreSQLへのMigration 21件、再実行21件skip、checksum不一致拒否
- [x] 隔離Local PostgreSQL Backup/Restore drill（Migration 21件 / public schema table 42件 / 公式データRead・主要Write、2026-08-31）
- [ ] Cloudflare API `/api/health/ready`（2026-08-31実測503。Secret変更/DeployはHuman Gate）
- [x] Local API `/api/health/ready` 200、認証境界401、Web 200

## 2. Migration forward / rollback

### Forward（本番適用時）

```bash
COMPOSE_PROJECT_NAME=cci COMPOSE_FILE=/opt/cci/docker-compose.yml ./scripts/backup-local-postgres.sh
docker compose --env-file /etc/cci/cci.env -p cci -f /opt/cci/docker-compose.yml run --rm migrate
docker compose --env-file /etc/cci/cci.env -p cci -f /opt/cci/docker-compose.yml up -d
curl http://127.0.0.1:18000/api/health/ready
```

- `schema_migrations`がファイル名・SHA-256・適用日時を記録し、適用済みMigrationの改変を拒否する
- production への適用は承認後に実施（本リポジトリの承認境界に含む）

### Rollback

- Migration 005は既存行の更新と制約追加、009 / 018 / 019は既存テーブルの変更を含む。適用前Backupと別名DBでのRestore検証をRollbackの前提とする
- アプリ: 直前のデプロイ（Docker image tag / Worker version）へ切替
  - 本機: `sudo systemctl start cci`（`docker compose up -d`）で旧イメージタグを指定
  - Cloudflare: `wrangler rollback`
- DB: データ復旧が必要な場合は`docs/backup-restore.md`に従い、まず別名DBへRestoreして検証する
- DB schema / dataを適用前へ戻す必要がある場合は、旧アプリとの互換性を確認し、Backupを別名DBへRestoreして主要Flowを検証する。既存DBの置換はHuman Gate後に行う

## 3. 承認後に必要な操作（Phase 2）

- [ ] 本番デプロイ（本機 systemd への新イメージ適用 / Cloudflare 手動デプロイ）
- [ ] Required Checks PASS後のPR Squash Merge
- [ ] サブドメイン決定と DNS 設定（候補: `cci` / `costindex` / `civil-cost-index`）
- [ ] Cloudflare Access ポリシー・外部死活監視・Logpush の導入
