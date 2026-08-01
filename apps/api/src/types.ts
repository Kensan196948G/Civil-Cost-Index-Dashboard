export type Env = {
  DATABASE_URL: string;
  ADMIN_API_KEY: string;
  CORS_ORIGINS: string;
  APP_VERSION: string;
  BASIC_AUTH_USERNAME?: string;
  BASIC_AUTH_PASSWORD?: string;
  /** 任意: URL取込で許可するホスト（カンマ区切り）。未設定なら全パブリックホスト許可。 */
  FETCH_ALLOWED_HOSTS?: string;
};

export type Region = {
  id: string;
  region_code: string;
  region_name: string;
  region_type: string;
  parent_region_id: string | null;
  display_order: number | null;
  is_active: boolean;
};

export type Item = {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  sub_category: string | null;
  standard_name: string | null;
  default_unit: string | null;
  display_order: number | null;
  is_active: boolean;
};

export type DataSource = {
  id: string;
  source_code: string;
  source_name: string;
  source_type: string;
  provider_name: string;
  source_url: string | null;
  file_format: string | null;
  update_frequency: string | null;
  license_note: string | null;
  is_active: boolean;
  last_fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeSeriesPoint = {
  period: string;
  value: number | null;
  raw_value: number;
  mom_rate: number | null;
  yoy_rate: number | null;
  status: string;
};

export type Series = {
  series_id: string;
  label: string;
  unit: string;
  source_name: string;
  source_url: string | null;
  points: TimeSeriesPoint[];
};

export type TimeseriesConditions = {
  data_type: string;
  start_period: string | null;
  end_period: string | null;
  normalize: boolean;
  base_period: string | null;
};

export type RatePoint = {
  period: string;
  value: number;
};

export type RawRow = {
  id: string;
  data_source_id: string;
  data_type: string;
  item_id: string;
  item_name: string;
  item_code: string;
  region_id: string;
  region_name: string;
  region_code: string;
  period_date: string;
  value: string;
  unit: string | null;
  value_status: string;
  note: string | null;
  source_name: string;
  source_url: string | null;
  source_file_id: string | null;
  updated_at: string;
};
