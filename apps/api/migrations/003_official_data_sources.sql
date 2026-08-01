-- Official data sources for acquisition (idempotent; ON CONFLICT DO NOTHING)
-- Added items: aggregates / timber used by e-Stat 主要建設資材需給・価格動向調査

INSERT INTO items (item_code, item_name, category, sub_category, standard_name, default_unit, display_order, is_active) VALUES
    ('AGG_SAND', '骨材（砂）', 'MATERIAL_PRICE', '骨材', '砂', '指数', 40, TRUE),
    ('AGG_GRAVEL', '骨材（砂利）', 'MATERIAL_PRICE', '骨材', '砂利', '指数', 41, TRUE),
    ('AGG_CRUSHED', '骨材（砕石）', 'MATERIAL_PRICE', '骨材', '砕石', '指数', 42, TRUE),
    ('AGG_RECYCLED', '骨材（再生砕石）', 'MATERIAL_PRICE', '骨材', '再生砕石', '指数', 43, TRUE),
    ('WOOD_LUMBER', '木材（製材）', 'MATERIAL_PRICE', '木材', '製材', '指数', 44, TRUE),
    ('WOOD_PLYWOOD', '木材（型枠用合板）', 'MATERIAL_PRICE', '木材', '型枠用合板', '指数', 45, TRUE)
ON CONFLICT (item_code) DO NOTHING;

INSERT INTO data_sources (source_code, source_name, source_type, provider_name, source_url, file_format, update_frequency, license_note, is_active) VALUES
    (
        'ESTAT_MATERIAL_SUPPLY',
        'e-Stat 主要建設資材需給・価格動向調査',
        'material',
        '経済産業省',
        'https://www.e-stat.go.jp/stat-search?query=%E4%B8%BB%E8%A6%81%E5%BB%BA%E8%A8%AD%E8%B3%87%E6%9D%90%E9%9C%80%E7%B5%A6%E3%83%BB%E4%BE%A1%E6%A0%BC%E5%8B%95%E5%90%91%E8%AA%BF%E6%9F%BB&layout=dataset',
        'xlsx',
        'monthly',
        '毎月公表（概ね翌月下旬）。価格・需給・在庫の動向指数（1〜5段階）を都道府県別に収録。表-2形式は専用変換で取込可能。直近確認例: statInfId=000040478417（2026年7月分、EXCEL）。API利用には e-Stat アプリ登録（appId）が必要。',
        TRUE
    ),
    (
        'ESTAT_CPI',
        'e-Stat 消費者物価指数',
        'index',
        '総務省統計局',
        'https://www.e-stat.go.jp/stat-search/files?toukei=00200573',
        'api',
        'monthly',
        'e-Stat API（getStatsData / getSimpleStatsData）から取得。appId（無料登録）必須。例: statsDataId=0003427113（2020年基準）、cdCat01=0001（総合）、cdArea=00000（全国）。エンドポイント https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData',
        TRUE
    ),
    (
        'KENPLAZA_MATERIAL',
        'けんせつPlaza 主要建設資材価格（市場）',
        'material',
        '一般財団法人経済調査会',
        'https://www.kensetsu-plaza.com/market',
        'html',
        'monthly',
        'Web公開中心。APIは提供されていないため参照用途。価格データを自動取得する場合は利用規約・会員条件を確認のうえ手動取込（CSV/Excel化）する。',
        TRUE
    ),
    (
        'MLIT_LABOR',
        '公共工事設計労務単価',
        'labor',
        '国土交通省',
        'https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo14_hh_000001_00261.html',
        'pdf',
        'yearly',
        '毎年3月適用分を公表（令和7年3月適用版は上記プレスリリース）。公表資料はPDF/Excel中心で標準APIなし。都道府県・地方整備局サイトでも公開。再配布・転載は出典明記等の条件を確認。',
        TRUE
    )
ON CONFLICT (source_code) DO NOTHING;
