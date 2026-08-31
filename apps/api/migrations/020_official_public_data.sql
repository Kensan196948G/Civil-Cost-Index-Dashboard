-- Official public data readiness: prefectures and current source provenance.

-- The legacy master already uses the Hokkaido row for both area selection and
-- Hokkaido data. Preserve its id/code so existing time-series references remain valid.
UPDATE regions
SET region_type = 'prefecture', display_order = 101, updated_at = now()
WHERE region_name = '北海道';

WITH prefectures(region_code, region_name, parent_code, display_order) AS (
  VALUES
    ('JP-PREF-02', '青森県', 'JP-03', 102),
    ('JP-PREF-03', '岩手県', 'JP-03', 103),
    ('JP-PREF-04', '宮城県', 'JP-03', 104),
    ('JP-PREF-05', '秋田県', 'JP-03', 105),
    ('JP-PREF-06', '山形県', 'JP-03', 106),
    ('JP-PREF-07', '福島県', 'JP-03', 107),
    ('JP-PREF-08', '茨城県', 'JP-04', 108),
    ('JP-PREF-09', '栃木県', 'JP-04', 109),
    ('JP-PREF-10', '群馬県', 'JP-04', 110),
    ('JP-PREF-11', '埼玉県', 'JP-04', 111),
    ('JP-PREF-12', '千葉県', 'JP-04', 112),
    ('JP-PREF-13', '東京都', 'JP-04', 113),
    ('JP-PREF-14', '神奈川県', 'JP-04', 114),
    ('JP-PREF-15', '新潟県', 'JP-05', 115),
    ('JP-PREF-16', '富山県', 'JP-05', 116),
    ('JP-PREF-17', '石川県', 'JP-05', 117),
    ('JP-PREF-18', '福井県', 'JP-05', 118),
    ('JP-PREF-19', '山梨県', 'JP-06', 119),
    ('JP-PREF-20', '長野県', 'JP-06', 120),
    ('JP-PREF-21', '岐阜県', 'JP-06', 121),
    ('JP-PREF-22', '静岡県', 'JP-06', 122),
    ('JP-PREF-23', '愛知県', 'JP-06', 123),
    ('JP-PREF-24', '三重県', 'JP-06', 124),
    ('JP-PREF-25', '滋賀県', 'JP-07', 125),
    ('JP-PREF-26', '京都府', 'JP-07', 126),
    ('JP-PREF-27', '大阪府', 'JP-07', 127),
    ('JP-PREF-28', '兵庫県', 'JP-07', 128),
    ('JP-PREF-29', '奈良県', 'JP-07', 129),
    ('JP-PREF-30', '和歌山県', 'JP-07', 130),
    ('JP-PREF-31', '鳥取県', 'JP-08', 131),
    ('JP-PREF-32', '島根県', 'JP-08', 132),
    ('JP-PREF-33', '岡山県', 'JP-08', 133),
    ('JP-PREF-34', '広島県', 'JP-08', 134),
    ('JP-PREF-35', '山口県', 'JP-08', 135),
    ('JP-PREF-36', '徳島県', 'JP-09', 136),
    ('JP-PREF-37', '香川県', 'JP-09', 137),
    ('JP-PREF-38', '愛媛県', 'JP-09', 138),
    ('JP-PREF-39', '高知県', 'JP-09', 139),
    ('JP-PREF-40', '福岡県', 'JP-10', 140),
    ('JP-PREF-41', '佐賀県', 'JP-10', 141),
    ('JP-PREF-42', '長崎県', 'JP-10', 142),
    ('JP-PREF-43', '熊本県', 'JP-10', 143),
    ('JP-PREF-44', '大分県', 'JP-10', 144),
    ('JP-PREF-45', '宮崎県', 'JP-10', 145),
    ('JP-PREF-46', '鹿児島県', 'JP-10', 146),
    ('JP-PREF-47', '沖縄県', 'JP-10', 147)
)
INSERT INTO regions
  (region_code, region_name, region_type, parent_region_id, display_order, is_active)
SELECT p.region_code, p.region_name, 'prefecture', parent.id, p.display_order, TRUE
FROM prefectures p
JOIN regions parent ON parent.region_code = p.parent_code
ON CONFLICT (region_code) DO UPDATE SET
  region_name = EXCLUDED.region_name,
  region_type = EXCLUDED.region_type,
  parent_region_id = EXCLUDED.parent_region_id,
  display_order = EXCLUDED.display_order,
  is_active = TRUE,
  updated_at = now();

UPDATE data_sources
SET source_url = 'https://www.mlit.go.jp/report/press/content/001981942.pdf',
    file_format = 'pdf',
    update_frequency = 'yearly',
    license_note = '令和8年3月適用。所定労働時間内8時間当たり。時間外・休日・深夜割増、現場管理費、一般管理費等の諸経費を含まない。',
    redistribution_note = '国土交通省公表PDFの数値表を標準CSVへ編集・加工。出典と加工した旨を表示し、国土交通省サイトの公共データ利用規約（第1.0版）に従う。',
    data_kind = 'actual_price',
    estimate_usable = TRUE,
    updated_at = now()
WHERE source_code = 'MLIT_LABOR';

UPDATE data_sources
SET source_url = 'https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040478417&fileKind=0',
    file_format = 'xlsx',
    update_frequency = 'monthly',
    license_note = '主要建設資材の価格動向・需給動向・在庫状況を1～5段階で評価する調査。実単価ではない。2026年7月公表ファイルを検証済み。',
    redistribution_note = '出典：政府統計の総合窓口(e-Stat)「主要建設資材需給・価格動向調査」。全国平均の価格動向を抽出・加工。e-Stat利用規約に従い出典と加工した旨を表示する。',
    data_kind = 'trend_assessment',
    estimate_usable = FALSE,
    updated_at = now()
WHERE source_code = 'ESTAT_MATERIAL_SUPPLY';
