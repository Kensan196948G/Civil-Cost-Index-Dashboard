# バックアップ・リストア手順書（v0.1.0）

## 1. 方針

- 業務データ正本は Neon PostgreSQL
- Neon の自動バックアップ（ポイントインタイムリカバリ）を基本とする
- 定期的な論理バックアップ（pg_dump）を推奨
- コード・設定は Git リポジトリ（GitHub）が正本

## 2. 論理バックアップ（推奨）

```bash
# Neon の接続文字列（DIRECT）が必要。秘密情報のため .dev.vars 等で管理
cd apps/api
export PGPASSWORD=...  # または DATABASE_URL_DIRECT を設定
pg_dump "$DATABASE_URL_DIRECT" -F c -f backups/cci-$(date +%Y%m%d).dump
```

保管: ローカル or 社内ストレージ（最低 7 世代）

## 3. リストア手順

```bash
# 新規DB or 空のDBへ
pg_restore -d "$DATABASE_URL_DIRECT" backups/cci-YYYYMMDD.dump
# または SQL 形式
psql "$DATABASE_URL_DIRECT" -f backups/cci-YYYYMMDD.sql
```

## 4. Neon ポイントインタイムリカバリ

1. Neon ダッシュボード > Branches > Restore
2. 復旧時点を選択（デフォルト履歴保持 1 日）
3. 復旧ブランチの接続文字列を取得し、動作確認後に切替

## 5. 復旧時の注意

- アプリの DATABASE_URL を新しい DB へ向ける（Worker Secret 更新）
- 復旧後はヘルスチェックと主要APIでデータ整合を確認
- 破壊的マイグレーションが原因の場合は、マイグレーション履歴との整合に注意
