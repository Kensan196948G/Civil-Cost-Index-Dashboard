-- Phase 6-3: 港湾版諸経費率（サンプル）と適用期間

INSERT INTO overhead_rates (base_id, rate_type, rate, applicable_from, applicable_to)
SELECT id, 'common_temp', 0.1500, '2026-04-01', '2027-03-31' FROM estimation_bases WHERE base_code = 'PORT-2026'
ON CONFLICT (base_id, rate_type) DO UPDATE SET
  rate = EXCLUDED.rate,
  applicable_from = EXCLUDED.applicable_from,
  applicable_to = EXCLUDED.applicable_to,
  updated_at = now();

INSERT INTO overhead_rates (base_id, rate_type, rate, applicable_from, applicable_to)
SELECT id, 'site_management', 0.1800, '2026-04-01', '2027-03-31' FROM estimation_bases WHERE base_code = 'PORT-2026'
ON CONFLICT (base_id, rate_type) DO UPDATE SET
  rate = EXCLUDED.rate,
  applicable_from = EXCLUDED.applicable_from,
  applicable_to = EXCLUDED.applicable_to,
  updated_at = now();

INSERT INTO overhead_rates (base_id, rate_type, rate, applicable_from, applicable_to)
SELECT id, 'general_management', 0.1000, '2026-04-01', '2027-03-31' FROM estimation_bases WHERE base_code = 'PORT-2026'
ON CONFLICT (base_id, rate_type) DO UPDATE SET
  rate = EXCLUDED.rate,
  applicable_from = EXCLUDED.applicable_from,
  applicable_to = EXCLUDED.applicable_to,
  updated_at = now();
