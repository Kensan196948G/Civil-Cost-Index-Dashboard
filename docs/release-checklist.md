# リリースチェックリスト（v0.1.0 Phase 1）

## 1. リリース前チェック

- [x] API: lint / typecheck / テスト47件（xlsx・URL取込・e-Stat変換・SSRFガード含む） / ビルド（Worker dry-run + Node bundle）
- [x] Web: lint / typecheck / standalone ビルド（Docker・本番経路）
- [x] データ取込: CSV/Excel 手動取込・URL取得・e-Stat 主要建設資材（表-2）専用変換・Shift_JIS 対応
- [x] 依存監査: npm audit 0件 / pnpm audit 0件（postcss・sharp・echarts を修正版へ更新済み）
- [x] 秘密・接続文字列・PII のリポジトリ/履歴露出なし（プレースホルダのみ）
- [x] API 異常系: 401 / 409 / 400 / 501 / 404 を確認
- [x] E2E（Playwright・Docker）: 29/29 PASS（全8画面・モバイル375px・a11y基本・console errorなし）
- [x] migration forward（Neon 適用済み） / rollback 手順（下記）
- [x] 監視: `/api/health/ready` 死活確認、Workers Observability 有効
- [x] 運用・障害対応・バックアップ・Cloudflare/Neon 文書が実態と一致

## 2. Migration forward / rollback

### Forward（本番適用時）

```bash
cd apps/api
export DATABASE_URL="<Neon direct connection string>"   # 環境変数で指定（出力しない）
npm run db:migrate   # migrations/001〜003 を適用（冪等。003=公式データソース＋骨材/木材マスタ）
npm run db:seed      # サンプル/マスタ投入（同一ハッシュ重複はスキップ）
```

- マイグレーションは `CREATE TABLE IF NOT EXISTS` / `ON CONFLICT DO NOTHING` のみの**後方互換・冪等**設計
- production への適用は承認後に実施（本リポジトリの承認境界に含む）

### Rollback

- 本構成は**破壊的マイグレーションを含まない**ため、アプリのロールバックで対応
- アプリ: 直前のデプロイ（Docker image tag / Worker version）へ切替
  - 本機: `sudo systemctl start cci`（`docker compose up -d`）で旧イメージタグを指定
  - Cloudflare: `wrangler rollback`
- DB: データ復旧が必要な場合は `docs/backup-restore.md` の Neon PITR / ブランチ手順を使用
- 追加テーブルのみの変更であるため、既存データへの影響はない（DROP/TRUNCATE は実施しない）

## 3. 承認後に必要な操作（Phase 2）

- [ ] 本番デプロイ（本機 systemd への新イメージ適用 / Cloudflare 手動デプロイ）
- [ ] PR merge（Draft → Ready → レビュー承認後）
- [ ] サブドメイン決定と DNS 設定（候補: `cci` / `costindex` / `civil-cost-index`）
- [ ] Cloudflare Access ポリシー・外部死活監視・Logpush の導入
