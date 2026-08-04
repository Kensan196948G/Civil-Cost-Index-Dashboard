export type DataCategory =
  | "MATERIAL_PRICE"
  | "LABOR_COST"
  | "PRICE_INDEX"
  | "FUEL_PRICE"
  | "OTHER";

export interface Meta {
  request_id: string;
  generated_at: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta: Meta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown[];
}

export interface Region {
  id: string;
  region_code: string;
  region_name: string;
  region_type: string;
  parent_region_id: string | null;
  display_order: number | null;
  is_active: boolean;
}

export interface Item {
  id: string;
  item_code: string;
  item_name: string;
  category: DataCategory;
  sub_category: string | null;
  standard_name: string | null;
  default_unit: string | null;
  display_order: number | null;
  is_active: boolean;
}

export interface SeriesPoint {
  period: string;
  value: number | null;
  raw_value: number;
  mom_rate: number | null;
  yoy_rate: number | null;
  status: string;
}

export interface Series {
  series_id: string;
  label: string;
  unit: string;
  source_name: string;
  source_url: string | null;
  points: SeriesPoint[];
}

export interface TimeseriesConditions {
  data_type: string;
  start_period: string | null;
  end_period: string | null;
  normalize: boolean;
  base_period: string | null;
}

export interface TimeseriesResponse {
  conditions: TimeseriesConditions;
  series: Series[];
}

export interface Kpi {
  name: string;
  value: number;
  unit: string;
  period: string;
  mom_rate: number | null;
  yoy_rate: number | null;
}

export interface DashboardAlert {
  item_name: string;
  region_name: string;
  period: string;
  mom_rate: number | null;
  yoy_rate: number | null;
  reason: string;
  priority: "high" | "medium" | "low";
}

export interface UpdateStatus {
  data_source_name: string;
  last_fetched_at: string | null;
  status: string;
}

export interface DashboardSummary {
  latest_period: string | null;
  last_updated_at: string | null;
  kpis: Kpi[];
  alerts: DashboardAlert[];
  update_status: UpdateStatus[];
}

export interface DataSource {
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
}

export interface DataSourceInput {
  source_code: string;
  source_name: string;
  source_type: string;
  provider_name: string;
  source_url?: string;
  file_format?: string;
  update_frequency?: string;
  license_note?: string;
  is_active?: boolean;
}

export interface FetchJob {
  id: string;
  data_source_id: string;
  data_source_name: string;
  job_type: string;
  status: string;
  file_name: string | null;
  original_url: string | null;
  file_hash: string | null;
  total_rows: number | null;
  success_rows: number | null;
  error_rows: number | null;
  error_detail: Array<{ row: number; column: string; reason: string }>;
  started_at: string;
  finished_at: string | null;
}

export interface FetchUrlInput {
  data_source_id: string;
  url?: string;
}

export interface TimeseriesParams {
  data_type: DataCategory;
  item_ids?: string;
  region_ids?: string;
  start_period?: string;
  end_period?: string;
  normalize?: boolean;
  base_period?: string;
  chart_type?: string;
}

// ---- AI機能（Phase 1: AI市況ナビ） ----

export type AiAudience = "default" | "executive" | "estimator" | "client";

export interface AiStatus {
  ai_enabled: boolean;
  provider: string;
  model: string | null;
  features: string[];
}

export interface AiSeriesFact {
  item_name: string;
  region_name: string;
  category: string;
  unit: string | null;
  latest_period: string;
  latest_value: number;
  mom_rate: number | null;
  yoy_rate: number | null;
  streak: number;
  source_name: string | null;
}

export interface AiSourceRef {
  source_name: string;
  source_url: string | null;
  last_fetched_at: string | null;
}

export interface AiSummaryResponse {
  summary: string;
  generated_by: "ai" | "rule";
  provider: string;
  model: string | null;
  audience: AiAudience;
  audience_label: string;
  base_period: string | null;
  warnings: string[];
  sources: AiSourceRef[];
  facts: {
    top_yoy_up: AiSeriesFact[];
    top_yoy_down: AiSeriesFact[];
    streak_up: AiSeriesFact[];
    streak_down: AiSeriesFact[];
    stale_series: Array<{ item_name: string; region_name: string; latest_period: string; months_behind: number }>;
  };
  audit_id: string | null;
  disclaimer: string;
}

export interface AiAlertExplained {
  item_name: string;
  region_name: string;
  period: string;
  mom_rate: number | null;
  yoy_rate: number | null;
  reason: string;
  priority: string;
  streak: number;
  explanation: string;
}

export interface AiAlertsResponse {
  generated_by: "ai" | "rule";
  provider: string;
  model: string | null;
  audit_id: string | null;
  alerts: AiAlertExplained[];
  disclaimer: string;
}

export interface AiReportResponse {
  report_type: string;
  report_type_label: string;
  markdown: string;
  generated_by: "ai" | "rule";
  provider: string;
  model: string | null;
  generated_at: string;
  base_period: string | null;
  audit_id: string | null;
}

export interface AiQualityIssue {
  type: "stale" | "gap" | "constant" | "outlier" | "name_variant";
  severity: "high" | "medium" | "low";
  item_name: string;
  region_name: string | null;
  detail: string;
}

export interface AiQualityScore {
  source_name: string;
  score: number;
  breakdown: { completeness: number; freshness: number; consistency: number };
  note: string;
}

export interface AiQualityResponse {
  checked_series: number;
  latest_period: string | null;
  issues: AiQualityIssue[];
  quality_scores: AiQualityScore[];
  note: string;
}

export interface AiTemplate {
  id: string;
  label: string;
  description: string;
  action:
    | { type: "summary"; audience?: string }
    | { type: "alerts" }
    | { type: "report"; report_type: string }
    | { type: "quality" };
}

export interface AiAuditLog {
  id: string;
  feature: string;
  question: string | null;
  provider: string;
  model: string | null;
  prompt_version: string | null;
  data_scope: unknown;
  response_preview: string;
  sources: unknown;
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  rating: string | null;
  feedback_comment: string | null;
  created_at: string;
}
