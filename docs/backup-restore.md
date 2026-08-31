# バックアップ・リストア手順書（v0.1.0）

## 1. 方針

- LAN業務データの正本はDocker ComposeのLocal PostgreSQLとする。
- 毎日`pg_dump` custom formatを取得し、社内NAS等の別媒体へ複製する。
- 最低7世代を保持し、四半期に1回以上、別名の検証DBへRestoreする。
- 目標値（要運用承認）はRPO 24時間以内、RTO 4時間以内とする。
- Cloudflare Worker互換経路のNeonは別系統でBackup/PITRを管理し、自動同期先とは扱わない。

## 2. Local PostgreSQLのBackup

Repository rootで次を実行する。出力は既定で`artifacts/backups/`に作成され、権限は`0600`相当になる。

```bash
COMPOSE_PROJECT_NAME=cci ./scripts/backup-local-postgres.sh
```

Scriptは`pg_dump -F c`実行後にファイルが空でないことと`pg_restore --list`を検証する。
BackupファイルはGitへ追加せず、権限制御された別媒体へ複製する。

## 3. Restore Drill

本番DB`cci`へ直接Restoreしない。Backupを新規の`cci_restore_verify_*` DBへ復元し、Migration checksum、Table数、復元先専用APIの主要Read/Writeを確認する。

```bash
COMPOSE_PROJECT_NAME=cci \
  CCI_RESTORE_DATABASE=cci_restore_verify_20260831 \
  ./scripts/verify-local-restore.sh artifacts/backups/cci-YYYYMMDD-HHMMSS.dump
```

Scriptは復元先DBへ接続する非公開の一時APIコンテナを起動し、終了時に停止する。検証DBは証跡確認のため自動削除しない。削除は対象名・Backup・検証結果を確認したうえで、運用者が明示的に承認して実施する。

Restore drillは次を自動確認する。

- API image内のMigration件数が`CCI_EXPECTED_MIGRATION_COUNT`（指定時）と一致すること
- `/api/health/ready`が200を返すこと
- Migration 020/021、47都道府県、公式データソース分類が復元されること
- 東京都・普通作業員の公式労務単価（2026-03、27,000円/日）がReadできること
- 検証用案件の作成・積算・削除が成功すること
- `schema_migrations`がAPI image内のMigration件数（現行21件）と一致し、適用済みchecksumに不一致がないこと

Repositoryの最新コードを検証する場合は、古い`latest` imageの再利用を防ぐため先にbuildする。

```bash
docker compose build api
COMPOSE_PROJECT_NAME=cci CCI_EXPECTED_MIGRATION_COUNT=21 \
  ./scripts/verify-local-restore.sh artifacts/backups/cci-YYYYMMDD-HHMMSS.dump
```

## 4. 自動Backup

本機で毎日03:30 JSTに取得するsystemd timer例を示す。

```ini
[Unit]
Description=CCI Local PostgreSQL logical backup
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/cci
Environment=COMPOSE_PROJECT_NAME=cci
Environment=CCI_BACKUP_DIR=/var/backups/cci
ExecStart=/opt/cci/scripts/backup-local-postgres.sh
```

Timerは`OnCalendar=*-*-* 03:30:00 Asia/Tokyo`、`Persistent=true`とし、失敗通知を監視へ接続する。

## 5. 障害復旧

1. APIへのWriteを停止する。
2. 対象Backupの日時・size・`pg_restore --list`結果を確認する。
3. 別名DBへRestoreし、主要Read/Writeと件数を検証する。
4. 本番`cci`の置換が必要な場合は、最新BackupとRollback方法を提示してHuman Gateを得る。
5. 切替後にReady、主要業務Flow、監査ログ、Backup jobを確認する。

Production DBのDROP、既存DBへの上書きRestore、volume削除は破壊的操作であり、承認なしに実施しない。

## 6. Cloudflare互換経路

Neon側はNeonのPITRと別媒体への`pg_dump`を使用する。復旧や接続先切替にはCloudflare Secret変更が伴うためHuman Gateとする。Local PostgreSQLとNeonのどちらが最新かを推測せず、最終更新時刻・件数・監査ログを比較してから切替判断を行う。
