# 外部評価（2026-08-09）の検証結果と対応

対象コミット: `2146180`（外部評価対応: データ種別・単価版・RBAC・定期取得・案件影響・積算連携・港湾PoC）

## 1. 評価内容の裏取り結果

本評価の指摘について、コード・本番DB・LAN環境・GitHub を実測して裏取りしました。

| 評価の指摘 | 裏取り結果 | 根拠 |
| --- | --- | --- |
| Worker直URLで未認証閲覧が成立（`/api/projects` 200, `/api/estimates` 200） | ✅ 実在。`auth.ts:190` が未認証を `viewer` として返すため、`requireRole(["viewer"])` を通過 | `apps/api/src/lib/auth.ts` 190行目 |
| LAN API readiness 503（DB接続失敗） | ✅ 実在。コンテナ内DNS `ESERVFAIL api.c-3.ap-southeast-1.aws.neon.tech` が原因で、4日間 unhealthy 継続 | `docker logs cci-api-1` |
| LAN API の認証境界 | ⚠️ 追加発見。`/etc/cci/cci.env` に BASIC_AUTH の値がなく、LAN API（:18000）も未認証で `/api/projects` 200 | `docker exec cci-api-1` 環境確認 |
| `price_version_id` の格納欄はあるが結果保存で未設定 | ✅ 実在。`estimate_materials.price_version_id` は INSERT で未指定。`estimate_headers` にはカラム自体なし | `008_estimating.sql` / `estimating.ts` |
| 積算基準IDが存在すれば計算でき、approved状態を検証しない | ✅ 実在。`calculateEstimate` の基準SELECTに status 条件なし | `estimating.ts` 721行目 |
| 確定（draft→confirmed）API・確定後削除禁止がない | ✅ 実在。confirm エンドポイントなし。DELETE は status 無関係に実行 | `index.ts` 1636行目 |
| 積算基準2件・単価版0件・積算結果1件 | ✅ 妥当。シードは `MLIT-2026`(approved) / `PORT-2026`(draft) のサンプルで「正式データ未投入」明記 | `008_estimating.sql` 151〜207行目 |
| `state.json` 不在 | ✅ 妥当。`.opencode/goals/state.json` は存在するが空（フェーズ・週・期限は未記録） | `.opencode/goals/state.json` |
| GitHub: Issue 9件・PR 0件・main無保護・scanning無効 | ✅ 実在。Dependabot / code scanning / secret scanning すべて無効、main ブランチ保護なし | `gh api` 実測 |
| CI 直近50回: 48成功/2失敗 | ✅ 概ね妥当。直近の main 実行はすべて成功 | `gh run list` |
| 積算計算ロジックが簡易（税率10%固定・3率） | ✅ 妥当。`computeEstimate` は数量×歩掛×単価→共通仮設→現場管理→一般管理→税 | `lib/estimating.ts` |
| スナップショット未固定（再現性不足） | ✅ 妥当。`estimate_headers` に入力一式の保存欄なし | `008_estimating.sql` |

## 2. 実施済み対応（P0）

### 2.1 認証境界の是正（Worker直URL・LAN API）

- `resolveIdentity` の未認証フォールバックを変更
  - 既定（`ALLOW_ANONYMOUS_VIEWER=false`）: 未認証は役割なし → `requireRole` が **401**
  - デモ環境のみ `ALLOW_ANONYMOUS_VIEWER=true` で従来どおり閲覧者(viewer)許可
- Basic認証（LAN全体ゲート）を通過したリクエストは `source=basic-auth` の閲覧者として識別
  - 管理操作は従来どおり `X-Admin-Key` / RBAC が必要
- ヘルスチェック（`/api/health/*`）は Basic認証対象外（死活監視が資格情報を送れないため）
- 反映先: `auth.ts` / `http.ts` / `types.ts` / `.env.example` / `docker-compose.yml`（repo・/opt/cci両方）

**LAN実測結果（2026-08-09）**:
| リクエスト | 対応前 | 対応後 |
| --- | --- | --- |
| 未認証 `GET /api/projects` | 200（データ取得可） | **401** |
| Basic認証付き `GET /api/projects` | — | **200** |
| 未認証 `GET /api/health/ready` | 503（DNS起因） | **200（DB ok）** |

### 2.2 LAN API 503 の修復

- 原因: コンテナ内DNSの一時的な解決失敗（`EAI_AGAIN` / `ESERVFAIL` for Neonホスト名）
- 対応: `docker restart cci-api-1` で復旧（再起動後、`/api/health/ready` が `database: ok` を返すことを確認）
- 併せて `/opt/cci/docker-compose.yml`・`/etc/cci/cci.env` に `ALLOW_ANONYMOUS_VIEWER=false` を明示設定

### 2.3 積算の版固定・計算再現性（P0）

- migration `018_estimate_versioning.sql`（本番DB適用済み・非破壊）
  - `estimate_headers` に `price_version_id` / `input_snapshot JSONB` / `snapshot_sha256` / `confirmed_by` / `confirmed_at` を追加
- `calculateEstimate` の変更
  - **基準の承認チェック**: `status='approved'` 以外は 409。適用日（applicable_from/to）範囲外も 409
  - **入力スナップショット保存**: 数量・歩掛・諸経費率・基準情報・港湾条件・採用単価版を JSON で固定し SHA-256 ハッシュとともに保存
  - `priceVersionId` を入力として受付（採用単価版フロー導入後の再現用）

### 2.4 確定・承認フロー（P0 の一部）

- `POST /api/estimates/:id/confirm` を新設（`estimating_manager` / `system_admin`）
  - `draft → confirmed` へ遷移し、確認者・確認日時を記録。操作監査ログにも記録
- `DELETE /api/estimates/:id` に **確定済み削除禁止** を追加（confirmed は 409、変更積算として新規作成を促す）

### 2.5 GitHub セキュリティ設定

| 項目 | 対応 | 状態 |
| --- | --- | --- |
| Dependabot（npm×2・GitHub Actions） | `.github/dependabot.yml` 新規作成 | ✅ |
| CodeQL（code scanning） | ⚠️ **freeプランのプライベートリポジトリでは利用不可**（Team/Enterprise限定）。ワークフローを新規作成したが実行不可のため削除。Team/Enterprise移行時または公開リポジトリ化時に有効化 | プラン制約 |
| Dependabot alerts / 自動修正 | `gh api` で有効化 | ✅ |
| main ブランチ保護 | CI必須（strict）・PRレビュー1件・管理者にも適用 | ✅ |
| Secret scanning / push保護 | ⚠️ APIでは無効化された状態を変更できない（現行APIは org の Code security configurations のみ）。**Web UI での手動有効化が必要** | 要手動 |

Secret scanning の手動有効化手順:
1. GitHub Web: リポジトリ → Settings → Code security and analysis
2. "Secret scanning" を Enable（無料プランでは有効）
3. "Push protection" も Enable を推奨

CodeQL（code scanning）の有効化条件:
- free プランでは**プライベートリポジトリで利用不可**（パブリックリポジトリのみ）
- GitHub Team / Enterprise への移行、またはリポジトリ公開時に有効化する
- 有効化手順: Settings → Code security and analysis → CodeQL を有効化（またはコードを再追加）

### 2.6 テスト

- `auth.test.ts`: 認証境界テストを追加（未認証401 / デモフラグでviewer / Basic認証 / 信頼ヘッダー非影響）→ 8件パス
- `smoke.test.ts`: `auth boundary` テスト追加、港湾テストは基準承認を一時的に実施して finally で復帰に変更
- 検証結果: **unit 100件 / smoke 42件 全パス、lint・typecheck クリーン**

## 3. 評価の妥当性に対する見解

総合評価（市況分析85%・積算代替35〜45%・「80〜90%代替」表現は危険）は**妥当**です。
特に「金額計算はコード、AIは候補のみ」という原則が評価されている一方で、以下の指摘は本質的で、
正式積算システムへの移行には避けて通れません。

- 正式データ（歩掛・単価・経費率）の投入はライセンス・保守事業が伴うため、機能開発だけで解決できない
- 計算再現性（スナップショット）と承認フローは本対応で土台を整備したが、運用ルール（誰が確認するか等）は別途策定が必要
- 港湾サンプル基準（PORT-2026）は `draft` のまま維持し、正式データ投入時に `approved` へ移行する方針

## 4. 未対応・ロードマップ

| 優先度 | 項目 | 状態 |
| --- | --- | --- |
| P0 | Secret scanning / push保護の有効化（Web UI） | 要手動操作（本ドキュメント 2.5 参照） |
| P0 | 正式積算データ整備（歩掛・施工パッケージ・機労材構成比・地域単価・経費率） | データ供給・ライセンス契約が必要 |
| P0 | 計算エンジン正式化（経費対象額区分・率/積上げ併用・再帰代価・点在工事・週休2日補正・価格帯補間） | 基準データとセットで実装 |
| P0 | 不変版の完全化（数量・歩掛・単価の revision 化、`draft→review→approved→superseded` 二段階承認） | 本対応で第一段（draft→confirmed・削除禁止・スナップショット）まで完了 |
| P1 | Gaia型UI（設計書階層取込・高速検索・過去工事コピー・警告・経費計算過程表示） | 未着手 |
| P1 | 正式帳票（発注者別様式・経費計算書・資料元表示）・ゴールドケース比較 | 未着手 |
| - | 港湾積算の正式化（一般土木と分離して並行管理） | 差別化要素として継続 |

## 5. 80〜90%到達に向けた現実的な対象と判定基準

評価提案のとおり、「国交省一般土木／特定地方整備局／令和8年度／主要20〜30工種／自社頻繁案件」へ
対象を限定し、代表実案件50件で以下を満たすことを到達条件とする（評価の判定基準に同意）。

- 設計書取込成功率90%以上 / 人手修正行10%以下
- Gaia／正解積算との最終金額差0円（または承認済み許容差）
- 根拠・出典欠損0件 / 未解決の違算防止ブロッカー0件
- 同一入力からの再計算一致率100%（本対応のスナップショットで検証可能に）
- 承認者・変更履歴・使用基準の追跡率100%
