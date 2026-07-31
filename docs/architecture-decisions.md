# アーキテクチャ決定記録（ADR）

## ADR-001: API は Cloudflare Worker（TypeScript）として実装する

**日付:** 2026-07-31
**ステータス:** 採用

### 背景

初期設計では FastAPI（Python）+ SQLAlchemy を Cloudflare Worker へデプロイする案があったが、
Cloudflare Workers の Python ランタイムは FastAPI/pandas/openpyxl 等のフルスタック実行に不向きであり、
常駐コンテナ運用には追加インフラと承認が必要になる。

### 決定

- API は **TypeScript + Hono** で実装し、Cloudflare Workers にデプロイする。
- DB 接続は **@neondatabase/serverless**（HTTP ドライバ）を使用し、Neon PostgreSQL を正本とする。
- CSV パースは papaparse、Excel は SheetJS（xlsx）を使用する。
- マイグレーションは `apps/api/scripts/migrate.mjs`（Node + pg）で実行し、既存 SQL（001/002）を再利用する。
- フロントエンドは Next.js の静的エクスポートを Cloudflare Pages にデプロイする。

### 理由

- Workers 上で実行可能な構成になり、常駐サーバ不要で Cloudflare 管理下に収まる。
- フロントエンドと同じ TypeScript エコシステムで統一でき、型共有・テスト基盤を共通化できる。
- 既存の SQL マイグレーションと API 契約はそのまま活かせる。

### 代替案（不採用）

- FastAPI を常駐コンテナで運用: 承認・保守対象のインフラが増えるため不採用。
- Workers の Python ランタイムで FastAPI を実行: 制約が強く実運用リスクが高いため不採用。

## ADR-002: 本番ドメイン候補（承認待ち）

- Web: `costindex.mirai-dx-platform.com`（推奨）
- API: `api.costindex.mirai-dx-platform.com`（推奨）

DNS 変更・カスタムドメイン設定は利用者承認後にのみ実施する。
