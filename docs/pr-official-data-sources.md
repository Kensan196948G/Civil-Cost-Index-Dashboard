# PR 本文案: 公式データソース取込対応

> GitHub トークン無効のため push は未実施（2026-08-01 時点）。トークン修復後に下記コマンドで push し、本文を PR に貼り付けてください。

## 実行予定コマンド

```bash
git push -u origin feat/official-data-sources
gh pr create --draft \
  --base main --head feat/official-data-sources \
  --title "feat: 公式データソース取込対応（xlsx・URL取得・e-Stat専用変換）" \
  --body-file docs/pr-official-data-sources.md
```

## PR 本文

### 目的

- データソース管理から公式データソース（e-Stat 主要建設資材需給・価格動向調査 / 消費者物価指数 / けんせつPlaza / 公共工事設計労務単価）を登録・取得できるようにする
- CSV に加えて Excel（xlsx）取込と、公開URLからの直接取込を可能にする

### 変更内容

- `POST /api/fetch-jobs`: 公開URLから CSV/Excel を取得して取込（SSRFガード・10MB制限・30秒タイムアウト・SHA-256重複防止・Shift_JIS/UTF-8自動判定）
- e-Stat 主要建設資材需給・価格動向調査（表-2）の専用変換（全国平均値の価格動向指数を月次系列化）
- migration 003: 公式データソース4件、骨材/木材マスタ6件
- データソース管理 UI: 公式プリセット登録・URL取得パネル・URL列
- 取込履歴 UI: 種別・取得元表示
- `FETCH_ALLOWED_HOSTS`（任意のホスト許可リスト）を compose/systemd/env に追加
- `docs/data-acquisition.md` 新設、README・運用手順・API契約・リリースノート更新

### 影響範囲

- API（Hono・Workers/Node 共通コード）、Web（管理画面）、Docker Compose/systemd 設定、ドキュメント
- スキーマ: 追加のみ（新テーブルなし・既存列変更なし）

### テスト結果

- API: lint PASS / typecheck PASS / vitest 47件 PASS（xlsx・SSRF・e-Stat変換・スモーク含む）
- API ビルド: `wrangler deploy --dry-run` PASS（Node bundle も成功）
- Web: lint PASS / typecheck PASS / Docker（本番経路）ビルド PASS
- ローカル `next build` はサンドボックスの仮想メモリ上限（ulimit -v 20GB）起因の Wasm 確保失敗（環境要因・コード起因なし）

### セキュリティ確認

- 秘密・接続文字列・PII の露出なし（diff スキャン済み）
- URL取込: プライベートIP/ループバック/予約アドレス/資格情報付きURLを拒否、`FETCH_ALLOWED_HOSTS` で任意制限
- 本番シークレット・DNS・Access ポリシー変更なし

### Migration 有無

- あり: `apps/api/migrations/003_official_data_sources.sql`（冪等・ON CONFLICT DO NOTHING・破壊的変更なし）

### Rollback 方法

- アプリ: 前コミット/前イメージへ切替
- DB: migration 003 は追加のみのため、適用後に戻す必要がある場合は対象行（公式ソース4件・マスタ6件）を削除

### Preview 確認方法

- 本機: `sudo systemctl restart cci` または `docker compose -p cci up -d --build`
- `/admin/data-sources/` で公式ソース一覧・URL取得を確認

### 残課題

- e-Stat API（消費者物価指数）は appId 登録後に取得・自動連携（appId はシークレット管理）
- けんせつPlaza・労務単価は API なしのため手動取込（PDF/Web から整形）
- スケジュール自動取得（定期ジョブ）は未実装
- 「調達庁系価格情報サービス」は公開OpenAPIを特定できず（要確認）

### 承認が必要な項目

- PR merge
- 本番デプロイ（systemd/Docker 再ビルド、Cloudflare 手動デプロイ）
- 本番DBへの migration 003 適用（Neon）

### Production-safe 判定

- コード・ドキュメント・テストは production-safe（追加変更のみ・後方互換）
- 本番反映（merge / deploy / migration）は未実施（承認待ち）
