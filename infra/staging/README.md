# CCI staging（Option C）

staging 専用の **LAN API + Cloudflare Tunnel + ローカル PostgreSQL** 構成です。
本番（`cci-api-production` / `ccid.mirai-dx-platform.com`）とMVP（`cci-api-mvp`）からは独立しています。

| 要素 | 値 |
| --- | --- |
| 公開API | `https://ccid-api-staging.mirai-dx-platform.com` |
| 公開Web | `https://ccid-mvp-staging.mirai-dx-platform.com`（既存の `cci-web-mvp-staging`） |
| DB | ローカル PostgreSQL 16 `cci_staging`（Unix socket + peer 認証） |
| API | Docker `cci-staging-api`（`127.0.0.1:18806` → `8000`） |
| Tunnel | Cloudflare Tunnel `cci-staging`（`fabd214e-180b-4e54-8d67-9923e81df87a`） |
| cloudflared | Docker `cci-staging-cloudflared`（`network_mode: host`） |

## 初回セットアップ（人間が実行）

1. DB（既に構築済みの場合はスキップ）:
   ```bash
   psql -d postgres -c "CREATE DATABASE cci_staging"
   cd apps/api
   DATABASE_URL='postgresql://kensan@/cci_staging?host=/var/run/postgresql&sslmode=disable' npm run db:migrate
   DATABASE_URL='postgresql://kensan@/cci_staging?host=/var/run/postgresql&sslmode=disable' npm run db:seed
   ```
2. Tunnel（既に構築済みの場合はスキップ）:
   ```bash
   cloudflared tunnel create cci-staging
   cloudflared tunnel route dns --overwrite-dns <tunnel-id> ccid-api-staging.mirai-dx-platform.com
   ```
   `~/.cloudflared/cci-staging-docker-config.yml` の `tunnel:` / `credentials-file:` を実際のID・パスに合わせる。
3. 環境変数ファイル:
   ```bash
   cp infra/staging/staging.env.example ~/.config/cci/staging.env
   chmod 600 ~/.config/cci/staging.env
   # 管理API・監査CSVを使う場合のみ ADMIN_API_KEY を追記（値はコミットしない）
   ```
4. 起動:
   ```bash
   docker compose -f infra/staging/docker-compose.yml up -d
   bash infra/staging/verify-staging.sh   # Web反映前は CSP と API接続先の検査が失敗する
   ```

## Web の反映（人間が実行）

Web は静的ビルドにAPI URLが焼き込まれるため、API切替時に再ビルドと反映が必要です。
ハーネスの self-evolution ポリシーゲート（DEPLOY critical）により、AIはこの操作を実行できません。

```bash
cd apps/web
NEXT_STATIC_EXPORT=1 NEXT_PUBLIC_API_BASE_URL=https://ccid-api-staging.mirai-dx-platform.com npm run build
npx wrangler deploy --name cci-web-mvp-staging
```

反映後:
```bash
bash infra/staging/verify-staging.sh
```

## 運用上の注意

- **再起動後の自動復帰**: コンテナは `restart: unless-stopped` ですが、`docker.service` が disabled のため
  `sudo systemctl enable --now docker` が必要です（Human Gate）。
- **DNS**: ホストのローカルリゾルバが負キャッシュを持つ場合があります。名前解決できない場合は
  `sudo resolvectl flush-caches` を実行するか、別端末から確認してください。
- **管理API**: `ADMIN_API_KEY` 未設定時は fail closed（401）です。設定後は `cci-staging-api` を再作成してください。
- **旧 Worker**: Web切替後、`cci-api-mvp-staging` とその secret は未使用になります。削除は不可逆のため人間判断です。
- **バックアップ**: `cci_staging` のバックアップ・保持期間は未設定です（方針決定が必要）。
- **公開範囲**: APIは匿名viewerで読み取り公開（旧staging Workerと同等）。Cloudflare Accessを付ける場合は追加設定が必要です。

## 検証

`verify-staging.sh` は以下を確認します（秘密値は表示しません）。

1. `/api/health/ready` が `status: ok`
2. `/api/regions` / `/api/items` が 200
3. Web が 200 かつ CSP に `static.cloudflareinsights.com` を含む
4. Web のビルドが新しいAPIホスト（`ccid-api-staging...`）を参照している
5. （任意）`CCI_STAGING_ADMIN_KEY` 設定時、監査CSVエクスポートが 200

すべての検査を実行し、失敗があれば exit 1 を返します。
