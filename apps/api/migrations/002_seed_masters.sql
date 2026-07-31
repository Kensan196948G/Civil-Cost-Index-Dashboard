-- Seed masters (idempotent; ON CONFLICT DO NOTHING)

INSERT INTO regions (region_code, region_name, region_type, display_order, is_active) VALUES
    ('JP-01', '全国', 'national', 1, TRUE),
    ('JP-02', '北海道', 'area', 2, TRUE),
    ('JP-03', '東北', 'area', 3, TRUE),
    ('JP-04', '関東', 'area', 4, TRUE),
    ('JP-05', '北陸', 'area', 5, TRUE),
    ('JP-06', '中部', 'area', 6, TRUE),
    ('JP-07', '近畿', 'area', 7, TRUE),
    ('JP-08', '中国', 'area', 8, TRUE),
    ('JP-09', '四国', 'area', 9, TRUE),
    ('JP-10', '九州', 'area', 10, TRUE)
ON CONFLICT (region_code) DO NOTHING;

INSERT INTO items (item_code, item_name, category, sub_category, standard_name, default_unit, display_order, is_active) VALUES
    ('STEEL_H', 'H形鋼', 'MATERIAL_PRICE', '鋼材', 'SS400 H-200x100', '円/t', 1, TRUE),
    ('CEMENT_PC', 'セメント', 'MATERIAL_PRICE', '建設資材', '普通ポルトランドセメント', '円/t', 2, TRUE),
    ('ASPHALT', 'アスファルト', 'MATERIAL_PRICE', '舗装材料', '混合物', '円/t', 3, TRUE),
    ('REBAR_SD', '異形棒鋼', 'MATERIAL_PRICE', '鋼材', 'SD295 D16', '円/t', 4, TRUE),
    ('CONCRETE_18', '生コンクリート', 'MATERIAL_PRICE', 'コンクリート', '18-8-25', '円/m3', 5, TRUE),
    ('LABOR_COMMON', '普通作業員', 'LABOR_COST', '労務単価', '一般土木', '円/日', 10, TRUE),
    ('LABOR_SPECIAL', '特殊作業員', 'LABOR_COST', '労務単価', '一般土木', '円/日', 11, TRUE),
    ('LABOR_IRONWORKER', '鉄筋工', 'LABOR_COST', '労務単価', '一般土木', '円/日', 12, TRUE),
    ('LABOR_CARPENTER', '型枠工', 'LABOR_COST', '労務単価', '一般土木', '円/日', 13, TRUE),
    ('INDEX_CONSTRUCTION', '建設物価指数', 'PRICE_INDEX', '物価指数', '総合', '指数', 20, TRUE),
    ('INDEX_MATERIAL', '建設物価指数（材料）', 'PRICE_INDEX', '物価指数', '材料', '指数', 21, TRUE),
    ('INDEX_LABOR', '建設物価指数（労務）', 'PRICE_INDEX', '物価指数', '労務', '指数', 22, TRUE),
    ('FUEL_LIGHT_OIL', '軽油', 'FUEL_PRICE', '燃料', '軽油', '円/L', 30, TRUE),
    ('FUEL_GASOLINE', 'ガソリン', 'FUEL_PRICE', '燃料', 'レギュラー', '円/L', 31, TRUE)
ON CONFLICT (item_code) DO NOTHING;

INSERT INTO data_sources (source_code, source_name, source_type, provider_name, source_url, file_format, update_frequency, license_note, is_active) VALUES
    ('SAMPLE_MATERIAL', 'サンプル公開統計（資材価格）', 'material', 'サンプル提供元', NULL, 'csv', 'monthly', 'サンプルデータ', TRUE),
    ('SAMPLE_LABOR', 'サンプル労務単価', 'labor', 'サンプル提供元', NULL, 'csv', 'yearly', 'サンプルデータ', TRUE),
    ('SAMPLE_INDEX', 'サンプル物価指数', 'index', 'サンプル提供元', NULL, 'csv', 'monthly', 'サンプルデータ', TRUE)
ON CONFLICT (source_code) DO NOTHING;
