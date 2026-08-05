# 積算係数データ投入手順（3経路）

更新日: 2026-08-05

港湾（浚渫・ケーソン・基礎捨石）の正式係数データを、以下の3経路から投入する手順です。
投入後は必ずデータ承認者・積算責任者の確認を経て本番利用します。

## 1. 対象データ

| データ | テーブル | 投入経路 |
| --- | --- | --- |
| 積算基準（年度・端数規則） | `estimation_bases` | 画面（`/admin/estimation-bases`）またはAPI |
| 諸経費率（共通仮設/現場管理/一般管理費等） | `overhead_rates` | CSV/Excel取込 |
| 工種体系（工種/区分子/細別/規格） | `work_type_trees` | 画面（`/admin/breakdowns`）またはAPI |
| 歩掛（労務/材料/機械） | `work_breakdowns` | CSV/Excel取込 |
| 船舶マスタ（損料・供用係数・回航日数・待機率） | `vessels` | CSV/Excel取込 |
| 海象条件（海域・月別の施工可能日数・作業限界） | `port_sea_conditions` | 画面（`/port`）またはAPI |

## 2. 経路A: 国交省公表資料の電子化

1. 令和8年度港湾請負工事積算基準（船舶損料・歩掛・諸経費率）の公表PDF/Excelを入手
2. 表構造をAIが候補化し、人が確認（AIは金額を確定しない）
3. 標準テンプレートへ変換:
   - 船舶: [vessels_template.csv](../data/samples/vessels_template.csv)
   - 歩掛: [port_breakdowns_template.csv](../data/samples/port_breakdowns_template.csv)
   - 諸経費率: [overhead_rates_template.csv](../data/samples/overhead_rates_template.csv)
4. 取込（承認後に本番反映）

## 3. 経路B: 書籍から整備

1. 書籍の歩掛表・諸経費率表を標準Excelテンプレートへ転記
2. 同上テンプレートでCSV/Excel化し、取込

## 4. 経路C: 既存積算システムからエクスポート

1. 既存システムから船舶・歩掛・諸経費率をCSV/Excelへエクスポート
2. 列名を標準テンプレートへ対応付け（品目/細別コードのマッピング）
3. 取込後に既存システムの積算結果と突合検証（受入基準: 差異0円または承認済みの許容差）

## 5. 取込・検証フロー

1. `/admin/breakdowns` で歩掛を取込（`tree_code`, `condition_json`, `resource_type`,
   `resource_name`, `resource_unit`, `quantity_per_unit`, `unit_price`）
2. `/port` で船舶マスタを取込（`vessel_code`, `vessel_name`, `category`, `capacity`,
   `capacity_unit`, `hire_rate_per_day`, `availability_factor`, `mobilization_days`,
   `standby_rate`, `note`）
3. `/admin/estimation-bases` で諸経費率を取込（`rate_type`, `rate`, `applicable_from`, `applicable_to`）
4. 海象条件を `/port` で登録（海域・月別の施工可能日数・作業限界波高/風速）
5. `/estimates` で港湾積算を実行し、手計算/既存システムと照合
6. 承認後、`estimation_bases.status` を `approved` へ更新

## 6. 注意

- 取込データの出典・基準年度・適用日・ライセンス/転載可否は必ず台帳化する
- サンプル値（MLIT-2026 / PORT-2026）は正式データ投入までの動作確認用
