# データ取得手順書（公式データソース）

本システムの「データソース管理」で取り扱う公式データソースの一覧と、取得・取込の手順を記載します。
更新日: 2026-08-31

## 1. 対象データソース一覧

| コード | 名称 | 種別 | 提供元 | 形式 | 更新頻度 | 主URL | 取得方法 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ESTAT_MATERIAL_SUPPLY` | e-Stat 主要建設資材需給・価格動向調査 | 資材 | 国土交通省 | Excel | 月次 | [2026年7月公表ファイル](https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040478417&fileKind=0) | URL取込（専用変換） |
| `ESTAT_CPI` | e-Stat 消費者物価指数 | 指数 | 総務省統計局 | API | 月次 | [e-Stat 統計表](https://www.e-stat.go.jp/stat-search/files?toukei=00200573) | e-Stat API（appId必須） |
| `KENPLAZA_MATERIAL` | けんせつPlaza 主要建設資材価格（市場） | 資材 | 経済調査会 | Web | 月次 | [けんせつPlaza market](https://www.kensetsu-plaza.com/market) | Web閲覧・手動取込 |
| `MLIT_LABOR` | 公共工事設計労務単価 | 労務 | 国土交通省 | PDF | 年次 | [令和8年3月適用版プレスリリース](https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo14_hh_000001_00337.html) | 同梱正規化CSV / 公表資料の更新 |

> 「調達庁系の価格情報サービス（施設共通資材・市場施工価格・資源分類）」については、今回の調査範囲で
> 該当する公開OpenAPIを特定できませんでした。候補として「官公需情報ポータル（入札情報）」等がありますが、
> 価格情報APIとしては未確認のため、登録・取込対象にはしていません（要確認事項）。

## 2. 取込方式の使い分け

### 2.0 データ種別の管理（実単価／指数／動向評価値）

本システムでは、取込データを「データ種別」と「積算利用可否」で管理します。

| データ種別 | 例 | 積算利用 |
| --- | --- | --- |
| 実単価（`actual_price`） | けんせつPlaza 主要建設資材価格、公共工事設計労務単価 | 単価候補として利用可能 |
| 公的指数（`official_index`） | 消費者物価指数、建設物価指数 | 価格補正・傾向分析 |
| 動向評価値（`trend_assessment`） | 主要建設資材需給・価格動向調査（1〜5段階） | 市況の参考情報のみ |
| 社内実績単価（`internal_actual`） | 購買価格、協力会社見積 | 権限管理下で積算参考 |
| 採用単価（`adopted_price`） | 積算責任者が決定した単価 | 正式な積算計算に使用 |

`estimate_usable = false` の系列は画面・API・Excel出力で「参考のみ」と表示され、
積算の単価根拠としては利用できません（データガバナンス上の制約）。

### 2.1 URLから取得（推奨）

`/admin/data-sources/` の「URLから取得」で、公開URLから直接ダウンロードして取込めます。

- 対応形式: CSV / Excel（xlsx）
- 上限: 10MB / 30秒タイムアウト / リダイレクト3回まで
- 重複防止: 同一データソース・同一SHA-256のファイルは 409 で拒否
- SSRF対策: プライベートIP・ループバック・予約アドレス・資格情報付きURLを拒否
- ホスト制限: `FETCH_ALLOWED_HOSTS` を設定すると指定ホストのみ許可（例: `e-stat.go.jp,*.mlit.go.jp`）

CLI 例:

```bash
curl -X POST http://192.168.0.185:3000/api/fetch-jobs \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{
    "data_source_id": "<UUID>",
    "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040478417&fileKind=0"
  }'
```

### 2.2 手動アップロード（CSV / Excel）

`/admin/data-sources/` の「データ取込」からファイルをアップロードします。
標準ヘッダーは次のとおりです（別名も対応）。

| 論理名 | 標準ヘッダー | 別名例 |
| --- | --- | --- |
| 年月 | `年月` | `period`, `対象年月` |
| 品目 | `品目` | `item`, `品目名` |
| 規格 | `規格` | `standard`, `仕様` |
| 地域 | `地域` | `region`, `地域名` |
| 値 | `値` | `value`, `価格`, `単価` |
| 単位 | `単位` | `unit` |
| 状態 | `状態` | `status`（`confirmed`/`preliminary`/`revised`/`missing` または 速報/確報/改定/欠損） |
| 注記 | `注記` | `note` |
| 出典 | `出典` | `source` |

## 3. ソース別の取得手順

### 3.1 e-Stat 主要建設資材需給・価格動向調査（専用変換あり）

国土交通省が毎月公表する調査（建設資材モニター調査）で、主要資材の**価格動向・需給動向・在庫状況**を都道府県別に収録しています
（指数は1〜5段階。数値は円建ての市場価格ではありません）。

> **提供元**: 国土交通省（経済産業省ではありません。誤記載を修正済み: 2026-08-04）
> **扱い**: `data_kind = trend_assessment` / `estimate_usable = false`（参考のみ）

- e-Stat のファイル検索で最新月の Excel（表-1 / 表-2）をダウンロードします。
- 本システムの URL取込では、データソース `ESTAT_MATERIAL_SUPPLY` を選択すると専用変換が働き、
  表-2 の**全国平均値（価格動向・今回調査）**を `全国` の月次系列として取込みます。
- 変換後は 品目（例: セメント / 生コンクリート / 骨材（砂） / 異形棒鋼 / H形鋼 / 軽油）にマスタを対応付け、
  単位を `動向評価値`、注記に出典を記録します。
- アスファルトは既存マスタと一意に対応する「新材」を採用します。「再生材」は別系列であるため、同一キーへの上書きを避けて取込対象外とします。
- 都道府県別の詳細は、誤った集計を防ぐため**取込対象外**です（元ファイルで参照してください）。
- 調査時期の抽出: `＜令和8年7月1～5日現在＞` → `2026-07`

> 統計表ID（statsDataId）で API 取得する場合は、e-Stat アプリ登録（appId）後に
> `getStatsList` で統計表を検索してIDを確定してください（ファイルIDの `statInfId` とは異なります）。

### 3.2 e-Stat 消費者物価指数（API・appId必須）

e-Stat API を利用するには無料のアプリ登録が必要です。

1. <https://www.e-stat.go.jp/api/> でユーザー登録・アプリ登録し `appId` を取得
2. `appId` はシークレットとして管理（`.env` / Cloudflare Secret / `/etc/cci/cci.env`）し、リポジトリへコミットしない
3. API 呼び出し例（2020年基準・全国・総合・指数）:

```bash
curl "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=<appId>&statsDataId=0003427113&cdCat01=0001&cdArea=00000&cdTab=1&lang=J"
```

4. 応答 JSON を「年月・品目・地域・値」のCSVに整形して取込（または将来のAPI連携ジョブで自動化）

> `statsDataId=0003427113` は 2020年基準の消費者物価指数です。基準改定時は最新IDに更新してください。

### 3.3 けんせつPlaza 主要建設資材価格（Web閲覧中心）

- <https://www.kensetsu-plaza.com/market> で主要資材の地区別市況・価格推移を確認できます。
- APIは提供されていないため、ブラウザで確認し、必要な箇所をCSV/Excel化して手動取込します。
- 会員・購読制コンテンツの自動取得は行わないでください（利用規約を確認）。

### 3.4 公共工事設計労務単価（PDF公表・標準APIなし）

- 国土交通省が毎年3月適用分を公表し、都道府県・地方整備局サイトでも公開されます。
- 令和8年3月適用版: <https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo14_hh_000001_00337.html>
- 同梱データは47都道府県の普通作業員・特殊作業員・鉄筋工・型枠工、計188行です。
- 単価は所定労働時間内8時間当たりで、時間外・休日・深夜割増賃金、現場管理費、一般管理費等の諸経費を含みません。

### 3.5 同梱公式データの再生成

正規化済みCSVとprovenance manifestは `data/official/` に保存します。原本はRepositoryへ保存せず、
公式URLから取得してSHA-256をmanifestと照合します。労務PDFの変換にはPopplerの`pdftotext`が必要です。

```bash
curl -L 'https://www.mlit.go.jp/report/press/content/001981942.pdf' -o /tmp/mlit-labor-r8.pdf
curl -L 'https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040478417&fileKind=0' -o /tmp/estat-material-2026-07.xlsx
cd apps/api
npm run build:node
node dist-node/official-data-cli.mjs mlit-labor /tmp/mlit-labor-r8.pdf \
  ../../data/official/mlit_labor_2026-03.csv ../../data/official/mlit_labor_2026-03.manifest.json
node dist-node/official-data-cli.mjs estat-material /tmp/estat-material-2026-07.xlsx \
  ../../data/official/estat_material_2026-07.csv ../../data/official/estat_material_2026-07.manifest.json
```

検証済み原本SHA-256は、労務PDFが`f659c012a9bc50bb87731bfc469707a9360af7faf9aba073f09f4c193d573003`、
資材Excelが`d42bd471f645750853c75fb4ef35267344f0494862928b14c1fc1b50b8df2ab0`です。
国土交通省コンテンツは[公共データ利用規約（第1.0版）](https://www.mlit.go.jp/link.html)、
e-Stat配布データは[e-Stat利用規約](https://www.e-stat.go.jp/terms-of-use)に従い、出典と加工した旨を表示します。

## 4. 運用上の注意

- 本番DBへの取込は「データソース管理」の管理者操作（X-Admin-Key）でのみ行います。
- `FETCH_ALLOWED_HOSTS` を設定する場合は、利用する全ホストを明示してください。
- 取得した統計データの再配布条件はソースごとに異なるため、社外公開前に確認してください。
- Local schedulerは登録済みURLを自動取得します。APIがないPDF/Web中心のソースは、引き続き運用カレンダーで手動更新してください。
- `APP_ENV=production`かつ`SEED_SAMPLE_DATA=false`では公式データ200行のみをSeedします。開発デモで既存サンプルが必要な場合だけ`SEED_SAMPLE_DATA=true`を指定します。
- 既存DBのサンプル行はSeed切替だけでは削除されません。削除はBackup・影響確認・承認後に別Migrationで実施します。
