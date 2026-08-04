# バックアップ・リストア手順書（v0.1.0）

## 1. 方針

- 業務データ正本は Neon PostgreSQL
- Neon の自動バックアップ（ポイントインタイムリカバリ）を基本とする
- 定期的な論理バックアップ（pg_dump）を**自動ジョブ**で実行（手動推奨ではなく運用標準）
- コード・設定は Git リポジトリ（GitHub）が正本
- 目標値（要運用承認）: RPO = 24時間以内 / RTO = 4時間以内（仮）

## 1.1 自動バックアップ（systemd timer 例）

本機（LAN）運用で毎日 03:30 JST に論理バックアップを取得する例:

`/etc/systemd/system/cci-backup.service`

```ini
[Unit]
Description=CCI PostgreSQL logical backup
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/cci/cci.env
ExecStart=/usr/local/bin/cci-backup.sh
```

`/usr/local/bin/cci-backup.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP="$(date +%Y%m%d-%H%M)"
OUT=/var/backups/cci
mkdir -p "$OUT"
pg_dump "$DATABASE_URL_DIRECT" -F c -f "$OUT/cci-$STAMP.dump"
find "$OUT" -name 'cci-*.dump' -mtime +7 -delete
```

`/etc/systemd/system/cci-backup.timer`

```ini
[Unit]
Description=Daily CCI backup at 03:30 JST

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cci-backup.timer
sudo systemctl list-timers cci-backup.timer
```

Cloudflare Workers 構成では、Neon のポイントインタイムリカバリに加え、外部ストレージ
（社内 NAS / クラウド）への定期 pg_dump を GitHub Actions の scheduled workflow 等で自動化する。

## 1.2 定期リストア試験

- 四半期に1回以上、最新バックアップを検証用DBへリストアし、ヘルスチェックと主要API（一覧・時系列・AI監査）で整合を確認する
- 試験日・結果・担当者を運用ログ（リリースノートまたは管理台帳）に記録する
- リストア失敗時はバックアップ世代の保持期間・監視アラートを見直す

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
