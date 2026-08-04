-- 港湾工事コストモデル PoC（2026-08-05）
-- マリコン向け差別化の土台: 作業船マスタ・工種別構成・試算ロジック
-- 注意: 数値はPoC用の仮定値であり、港湾請負工事積算基準（令和8年度）の
-- 正式な船舶損料・供用係数・歩掛に置き換える必要があります。

CREATE TABLE IF NOT EXISTS vessels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_code VARCHAR(50) NOT NULL UNIQUE,
  vessel_name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  capacity DECIMAL(18,4),
  capacity_unit VARCHAR(30),
  hire_rate_per_day DECIMAL(18,2) NOT NULL,
  availability_factor DECIMAL(5,4) NOT NULL DEFAULT 0.7000,
  mobilization_days INTEGER NOT NULL DEFAULT 2,
  standby_rate DECIMAL(5,4) NOT NULL DEFAULT 0.5000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS port_work_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type_code VARCHAR(50) NOT NULL UNIQUE,
  work_type_name VARCHAR(200) NOT NULL,
  unit VARCHAR(30) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS port_work_type_vessels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type_id UUID NOT NULL REFERENCES port_work_types(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES vessels(id),
  quantity_per_unit DECIMAL(18,6) NOT NULL DEFAULT 1,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_port_work_vessel UNIQUE (work_type_id, vessel_id)
);

-- 作業船マスタ（PoC仮定値）
INSERT INTO vessels
  (vessel_code, vessel_name, category, capacity, capacity_unit, hire_rate_per_day,
   availability_factor, mobilization_days, standby_rate, note)
VALUES
  ('GRAB_8M3', 'グラブ浚渫船 8m3', '浚渫船', 800, 'm3/日', 950000, 0.70, 3, 0.50,
   '港湾浚渫の主力。能力・損料はPoC仮定値（令和8年度港湾積算基準の正式値に置換予定）'),
  ('DUMP_BARGE', '土運船 500m3', '土運船', 500, 'm3/日', 450000, 0.75, 2, 0.50,
   '浚渫土砂の運搬。運搬距離・揚土/土捨場により補正要'),
  ('CRANE_150T', '起重機船 150t吊', '起重機船', 60, 't/日', 1200000, 0.70, 4, 0.50,
   'ケーソン・捨石・消波ブロック据付用'),
  ('DIVER_TEAM', '潜水士班（送気員含む）', '潜水作業', 1, '班', 250000, 0.80, 1, 0.50,
   '潜水士・潜水送気員・監督を含む標準班構成'),
  ('STAGE_BARGE', '台船・作業船', 'その他', 1, '隻', 300000, 0.80, 2, 0.50,
   'ケーソン製作・据付時の台船等')
ON CONFLICT (vessel_code) DO NOTHING;

-- 工種（PoC: 3工種）
INSERT INTO port_work_types
  (work_type_code, work_type_name, unit, description)
VALUES
  ('DREDGING', '浚渫工', 'm3',
   'グラブ浚渫船による浚渫と土運船による運搬・土捨。土質・浚渫土量・運搬距離・海域条件により補正'),
  ('CAISSON', 'ケーソン製作・据付', '基',
   'ケーソン製作（台船上）と起重機船による据付。製作ヤード条件・据付時期により補正'),
  ('RUBBLE_BASE', '基礎捨石・被覆消波', 'm3',
   '捨石投入（起重機船）と潜水士による整正・確認。波浪・濁り・航路規制の影響あり')
ON CONFLICT (work_type_code) DO NOTHING;

-- 工種別の船舶構成（単位数量あたり必要船日）
INSERT INTO port_work_type_vessels (work_type_id, vessel_id, quantity_per_unit, is_primary)
SELECT wt.id, v.id, qty, primary_flag
FROM (VALUES
  ('DREDGING', 'GRAB_8M3', 1.0, true),
  ('DREDGING', 'DUMP_BARGE', 1.0, false),
  ('CAISSON', 'CRANE_150T', 1.0, true),
  ('CAISSON', 'STAGE_BARGE', 1.0, false),
  ('CAISSON', 'DIVER_TEAM', 1.0, false),
  ('RUBBLE_BASE', 'CRANE_150T', 1.0, true),
  ('RUBBLE_BASE', 'DIVER_TEAM', 1.0, false)
) AS seed(work_code, vessel_code, qty, primary_flag)
JOIN port_work_types wt ON wt.work_type_code = seed.work_code
JOIN vessels v ON v.vessel_code = seed.vessel_code
ON CONFLICT (work_type_id, vessel_id) DO NOTHING;
