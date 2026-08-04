-- Phase 5-3: 土質・浚渫土量・運搬距離・揚土/土捨場/処分費

CREATE TABLE IF NOT EXISTS soil_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soil_code VARCHAR(50) NOT NULL UNIQUE,
  soil_name VARCHAR(200) NOT NULL,
  dredging_correction_factor DECIMAL(6,4) NOT NULL DEFAULT 1.0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dredging_transport_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distance_km DECIMAL(8,2) NOT NULL,
  transport_coefficient DECIMAL(6,4) NOT NULL DEFAULT 1.0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_transport_distance UNIQUE (distance_km)
);

CREATE TABLE IF NOT EXISTS spoil_grounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spoil_code VARCHAR(50) NOT NULL UNIQUE,
  spoil_name VARCHAR(200) NOT NULL,
  area_name VARCHAR(200),
  distance_km DECIMAL(8,2),
  disposal_unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- サンプル土質（浚渫土質補正係数はPoC仮定値）
INSERT INTO soil_types (soil_code, soil_name, dredging_correction_factor, note) VALUES
  ('SAND', '砂', 1.0000, 'サンプル'),
  ('SANDY_SOIL', '砂質土', 1.0500, 'サンプル'),
  ('SILT', 'シルト', 1.1000, 'サンプル'),
  ('CLAY', '粘土', 1.1500, 'サンプル'),
  ('GRAVEL', '砂礫', 1.2000, 'サンプル'),
  ('ROCK', '岩', 1.5000, 'サンプル（岩ずりの割増）')
ON CONFLICT (soil_code) DO NOTHING;

-- サンプル運搬距離係数
INSERT INTO dredging_transport_rates (distance_km, transport_coefficient, note) VALUES
  (5, 1.0000, '5km以下'),
  (10, 1.0800, 'サンプル'),
  (20, 1.2000, 'サンプル'),
  (30, 1.3500, 'サンプル'),
  (50, 1.6000, 'サンプル')
ON CONFLICT (distance_km) DO NOTHING;

-- サンプル土捨場・処分場
INSERT INTO spoil_grounds (spoil_code, spoil_name, area_name, distance_km, disposal_unit_price, note) VALUES
  ('SEA_DUMP_A', '海域土捨場A', '東京湾沖', 15, 1200, 'サンプル'),
  ('LAND_DISPOSAL_B', '陸上処分場B', '千葉県内', 25, 2500, 'サンプル'),
  ('REUSE_C', '再生利用ヤードC', '神奈川県内', 10, 0, 'サンプル（有効利用で処分費ゼロ）')
ON CONFLICT (spoil_code) DO NOTHING;
