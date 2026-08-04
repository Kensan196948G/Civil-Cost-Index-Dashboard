-- 外部評価対応（2026-08-04）
-- 1) 主要建設資材需給・価格動向調査の提供元を国土交通省へ修正
-- 2) データ種別（実単価／公的指数／動向評価値／社内実績／採用単価）と
--    積算利用可否・再配布注記の管理列を追加
-- 既存の SQL は変更せず、追記マイグレーションで補正する。

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS data_kind VARCHAR(30) NOT NULL DEFAULT 'actual_price',
  ADD COLUMN IF NOT EXISTS estimate_usable BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE data_sources
  ADD COLUMN IF NOT EXISTS data_kind VARCHAR(30) NOT NULL DEFAULT 'actual_price',
  ADD COLUMN IF NOT EXISTS estimate_usable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS redistribution_note TEXT;

ALTER TABLE time_series_values
  ADD COLUMN IF NOT EXISTS data_kind VARCHAR(30) NOT NULL DEFAULT 'actual_price',
  ADD COLUMN IF NOT EXISTS estimate_usable BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_items_data_kind'
  ) THEN
    ALTER TABLE items ADD CONSTRAINT ck_items_data_kind
      CHECK (data_kind IN ('actual_price', 'official_index', 'trend_assessment', 'internal_actual', 'adopted_price'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_data_sources_data_kind'
  ) THEN
    ALTER TABLE data_sources ADD CONSTRAINT ck_data_sources_data_kind
      CHECK (data_kind IN ('actual_price', 'official_index', 'trend_assessment', 'internal_actual', 'adopted_price'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_time_series_values_data_kind'
  ) THEN
    ALTER TABLE time_series_values ADD CONSTRAINT ck_time_series_values_data_kind
      CHECK (data_kind IN ('actual_price', 'official_index', 'trend_assessment', 'internal_actual', 'adopted_price'));
  END IF;
END $$;

-- 品目マスタの分類
-- 動向評価値（国土交通省 建設資材モニター調査の1〜5段階値）は実単価・指数ではない
UPDATE items SET data_kind = 'trend_assessment', estimate_usable = FALSE
WHERE item_code IN ('AGG_SAND', 'AGG_GRAVEL', 'AGG_CRUSHED', 'AGG_RECYCLED', 'WOOD_LUMBER', 'WOOD_PLYWOOD');

-- 公的指数（建設物価指数・デフレーター系）
UPDATE items SET data_kind = 'official_index'
WHERE item_code LIKE 'INDEX_%';

-- データソースの提供元修正と種別設定
UPDATE data_sources
SET provider_name = '国土交通省',
    data_kind = 'trend_assessment',
    estimate_usable = FALSE,
    redistribution_note = '国土交通省公表の調査結果。社外資料への転載は出典明記・提供元の利用条件に従うこと。',
    license_note = '国土交通省が毎月公表する建設資材モニター調査。価格・需給・在庫の動向評価（1〜5段階）を都道府県別に収録。表-2形式は専用変換で取込可能。実単価・公的指数ではないため積算の単価根拠には使用不可（参考情報のみ）。',
    updated_at = now()
WHERE source_code = 'ESTAT_MATERIAL_SUPPLY';

UPDATE data_sources SET data_kind = 'official_index'
WHERE source_code = 'ESTAT_CPI';

UPDATE data_sources SET data_kind = 'actual_price'
WHERE source_code IN ('KENPLAZA_MATERIAL', 'MLIT_LABOR');

-- 既存時系列行へ品目・ソースの分類を反映
UPDATE time_series_values t
SET data_kind = i.data_kind,
    estimate_usable = i.estimate_usable
FROM items i
WHERE t.item_id = i.id;

UPDATE time_series_values t
SET data_kind = ds.data_kind,
    estimate_usable = ds.estimate_usable
FROM data_sources ds
WHERE t.data_source_id = ds.id AND t.item_id IS NULL;
