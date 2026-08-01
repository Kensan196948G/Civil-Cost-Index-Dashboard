# データ取得手順書（公式データソース）

本システムの「データソース管理」で取り扱う公式データソースの一覧と、取得・取込の手順を記載します。
更新日: 2026-08-01

## 1. 対象データソース一覧

| コード | 名称 | 種別 | 提供元 | 形式 | 更新頻度 | 主URL | 取得方法 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ESTAT_MATERIAL_SUPPLY` | e-Stat 主要建設資材需給・価格動向調査 | 資材 | 経済産業省 | Excel | 月次 | [e-Stat 検索](https://www.e-stat.go.jp/stat-search?query=%E4%B8%BB%E8%A6%81%E5%BB%BA%E8%A8%AD%E8%B3%87%E6%9D%90%E9%9C%80%E7%B5%A6%E3%83%BB%E4%BE%A1%E6%A0%BC%E5%8B%95%E5%90%91%E8%AA%BF%E6%9F%BB&layout=dataset) | URL取込（専用変換） |
| `ESTAT_CPI` | e-Stat 消費者物価指数 | 指数 | 総務省統計局 | API | 月次 | [e-Stat 統計表](https://www.e-stat.go.jp/stat-search/files?toukei=00200573) | e-Stat API（appId必須） |
| `KENPLAZA_MATERIAL` | けんせつPlaza 主要建設資材価格（市場） | 資材 | 経済調査会 | Web | 月次 | [けんせつPlaza market](https://www.kensetsu-plaza.com/market) | Web閲覧・手動取込 |
| `MLIT_LABOR` | 公共工事設計労務単価 | 労務 | 国土交通省 | PDF/Excel | 年次 | [令和7年3月適用版プレスリリース](https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo14_hh_000001_00261.html) | 公表資料の手動取込 |

> 「調達庁系の価格情報サービス（施設共通資材・市場施工価格・資源分類）」については、今回の調査範囲で
> 該当する公開OpenAPIを特定できませんでした。候補として「官公需情報ポータル（入札情報）」等がありますが、
> 価格情報APIとしては未確認のため、登録・取込対象にはしていません（要確認事項）。

## 2. 取込方式の使い分け

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

経済産業省が毎月公表する調査で、主要資材の**価格動向・需給動向・在庫状況**を都道府県別に収録しています
（指数は1〜5段階。数値は円建ての市場価格ではありません）。

- e-Stat のファイル検索で最新月の Excel（表-1 / 表-2）をダウンロードします。
- 本システムの URL取込では、データソース `ESTAT_MATERIAL_SUPPLY` を選択すると専用変換が働き、
  表-2 の**全国平均値（価格動向・今回調査）**を `全国` の月次系列として取込みます。
- 変換後は 品目（例: セメント / 生コンクリート / 骨材（砂） / 異形棒鋼 / H形鋼 / 軽油）にマスタを対応付け、
  単位を `指数`、注記に出典を記録します。
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

### 3.4 公共工事設計労務単価（PDF/Excel公表・標準APIなし）

- 国土交通省が毎年3月適用分を公表し、都道府県・地方整備局サイトでも公開されます。
- 令和7年3月適用版: <https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo14_hh_000001_00261.html>
- PDF/Excelを入手し、職種（普通作業員・特殊作業員・鉄筋工・型枠工など）と地域・単価を
  標準CSVに整形して手動取込します。転載・再配布は出典明記等の条件を確認してください。

## 4. 運用上の注意

- 本番DBへの取込は「データソース管理」の管理者操作（X-Admin-Key）でのみ行います。
- `FETCH_ALLOWED_HOSTS` を設定する場合は、利用する全ホストを明示してください。
- 取得した統計データの再配布条件はソースごとに異なるため、社外公開前に確認してください。
- スケジュール自動取得（定期ジョブ）は未実装です。月次/年次の更新は運用カレンダーで管理してください。
