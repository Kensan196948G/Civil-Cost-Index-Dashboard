-- Phase 5-2: 海象条件・海上施工可能日数

CREATE TABLE IF NOT EXISTS port_sea_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sea_area_code VARCHAR(50) NOT NULL,
  sea_area_name VARCHAR(200) NOT NULL,
  target_month INTEGER NOT NULL CHECK (target_month BETWEEN 1 AND 12),
  wave_height_limit DECIMAL(6,2),
  wind_speed_limit DECIMAL(6,2),
  turbidity_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  navigation_restriction VARCHAR(100),
  workable_days INTEGER NOT NULL,
  calendar_days INTEGER NOT NULL DEFAULT 30,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sea_area_month UNIQUE (sea_area_code, target_month)
);

-- サンプル海域（正式データは別途投入）
INSERT INTO port_sea_conditions
  (sea_area_code, sea_area_name, target_month, wave_height_limit, wind_speed_limit,
   turbidity_allowed, navigation_restriction, workable_days, calendar_days, note)
SELECT 'SEA_TOKYO_BAY', '東京湾', m, 1.0, 10, TRUE, '一部航路制限あり',
       CASE WHEN m IN (1,2,3,10,11,12) THEN 22 WHEN m IN (4,5,9) THEN 24 ELSE 20 END,
       30, 'サンプル値（令和8年度港湾積算基準の海域別データに置換予定）'
FROM generate_series(1, 12) AS m
ON CONFLICT (sea_area_code, target_month) DO NOTHING;

INSERT INTO port_sea_conditions
  (sea_area_code, sea_area_name, target_month, wave_height_limit, wind_speed_limit,
   turbidity_allowed, navigation_restriction, workable_days, calendar_days, note)
SELECT 'SEA_OSAKA_BAY', '大阪湾', m, 1.2, 12, TRUE, '制限なし',
       CASE WHEN m IN (1,2,3,11,12) THEN 24 WHEN m IN (6,7,8) THEN 20 ELSE 23 END,
       30, 'サンプル値（令和8年度港湾積算基準の海域別データに置換予定）'
FROM generate_series(1, 12) AS m
ON CONFLICT (sea_area_code, target_month) DO NOTHING;

INSERT INTO port_sea_conditions
  (sea_area_code, sea_area_name, target_month, wave_height_limit, wind_speed_limit,
   turbidity_allowed, navigation_restriction, workable_days, calendar_days, note)
SELECT 'SEA_ISE_BAY', '伊勢湾', m, 1.1, 11, TRUE, '航路近接の制限あり',
       CASE WHEN m IN (1,2,12) THEN 23 WHEN m IN (6,7,8,9) THEN 19 ELSE 22 END,
       30, 'サンプル値（令和8年度港湾積算基準の海域別データに置換予定）'
FROM generate_series(1, 12) AS m
ON CONFLICT (sea_area_code, target_month) DO NOTHING;
