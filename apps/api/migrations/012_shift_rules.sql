-- Phase 5-4: 夜間施工・交代制・超勤補正

CREATE TABLE IF NOT EXISTS work_shift_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code VARCHAR(50) NOT NULL UNIQUE,
  rule_name VARCHAR(200) NOT NULL,
  shift_type VARCHAR(30) NOT NULL,             -- night / rotation / overtime
  time_from VARCHAR(5),
  time_to VARCHAR(5),
  labor_surcharge_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
  machinery_surcharge_rate DECIMAL(6,4) NOT NULL DEFAULT 0,
  conditions_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- サンプル補正ルール（PoC仮定値）
INSERT INTO work_shift_rules
  (rule_code, rule_name, shift_type, time_from, time_to,
   labor_surcharge_rate, machinery_surcharge_rate, conditions_json, note)
VALUES
  ('NIGHT_22_05', '夜間施工（22時〜5時）', 'night', '22:00', '05:00',
   0.25, 0.25, '{"port":true}', '夜間の時間帯別割増（サンプル）'),
  ('ROTATION_2', '交代制（2班）', 'rotation', NULL, NULL,
   0.50, 0.30, '{"port":true}', '2交代制の労務・機械割増（サンプル）'),
  ('OVERTIME_2H', '超勤（2時間まで）', 'overtime', NULL, NULL,
   0.30, 0.10, '{"port":true}', '時間外労働の割増（サンプル）')
ON CONFLICT (rule_code) DO NOTHING;
