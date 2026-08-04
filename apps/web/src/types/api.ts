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
  data_kind: string;
  estimate_usable: boolean;
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
  data_kind: string;
  estimate_usable: boolean;
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
  data_kind: string;
  estimate_usable: boolean;
  redistribution_note: string | null;
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
  data_kind?: string;
  estimate_usable?: boolean;
  redistribution_note?: string;
  is_active?: boolean;
}

// ---- RBAC・監査（優先度A） ----

export type Role =
  | "viewer"
  | "data_ingester"
  | "data_approver"
  | "estimator"
  | "estimating_manager"
  | "auditor"
  | "system_admin";

export interface AuthMe {
  email: string;
  display_name: string | null;
  roles: string[];
  role_labels: string[];
  source: string;
  authenticated: boolean;
}

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  roles: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OperationAuditLog {
  id: string;
  actor_email: string;
  actor_role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  detail: unknown;
  created_at: string;
}

// ---- 単価版管理・スナップショット ----

export interface PriceVersion {
  id: string;
  data_source_id: string;
  source_name: string;
  source_code: string;
  item_id: string;
  item_code: string;
  item_name: string;
  data_kind: string;
  estimate_usable: boolean;
  region_id: string | null;
  region_name: string | null;
  region_code: string | null;
  version_label: string | null;
  value: number;
  unit: string;
  publication_date: string | null;
  effective_start: string;
  effective_end: string | null;
  revised_at: string | null;
  retroactive: boolean;
  delivery_terms: string | null;
  tax_inclusive: boolean;
  freight_included: boolean;
  note: string | null;
  status: "draft" | "approved" | "retired";
  parent_version_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PriceVersionInput {
  data_source_id: string;
  item_id: string;
  region_id?: string | null;
  version_label?: string | null;
  value: number;
  unit: string;
  publication_date?: string | null;
  effective_start: string;
  effective_end?: string | null;
  revised_at?: string | null;
  retroactive?: boolean;
  delivery_terms?: string | null;
  tax_inclusive?: boolean;
  freight_included?: boolean;
  note?: string | null;
  parent_version_id?: string | null;
}

export interface SnapshotItem {
  id: string;
  price_version_id: string | null;
  item_id: string;
  item_code: string;
  item_name: string;
  region_id: string | null;
  region_name: string | null;
  unit: string;
  value: number;
  data_source_name: string | null;
  effective_start: string | null;
  effective_end: string | null;
}

export interface PriceSnapshot {
  id: string;
  name: string;
  description: string | null;
  snapshot_date: string;
  created_by: string;
  created_at: string;
  item_count?: number;
  items?: SnapshotItem[];
}

export interface PriceVersionComparison {
  current: PriceVersion;
  previous: PriceVersion | null;
  diff: {
    value: { old: number; new: number };
    diff: number;
    diff_rate: number | null;
    effective_start: { old: string | null; new: string | null };
    effective_end: { old: string | null; new: string | null };
    tax_inclusive: { old: boolean; new: boolean };
    freight_included: { old: boolean; new: boolean };
    delivery_terms: { old: string | null; new: string | null };
  } | null;
}

// ---- 定期取得・承認待ち ----

export interface FetchSchedule {
  id: string;
  data_source_id: string;
  source_name: string;
  source_code: string;
  schedule_name: string | null;
  schedule_type: "daily" | "monthly" | "yearly";
  expected_day: number | null;
  expected_interval_days: number | null;
  enabled: boolean;
  approval_required: boolean;
  notify_channels: string[];
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FetchScheduleInput {
  data_source_id: string;
  schedule_name?: string | null;
  schedule_type?: "daily" | "monthly" | "yearly";
  expected_day?: number | null;
  expected_interval_days?: number | null;
  enabled?: boolean;
  approval_required?: boolean;
  notify_channels?: string[];
}

export interface StagedIngestion {
  id: string;
  data_source_id: string;
  source_name: string;
  source_code: string;
  schedule_id: string | null;
  file_name: string | null;
  original_url: string | null;
  total_rows: number;
  error_rows: number;
  status: "pending" | "approved" | "rejected";
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// ---- 案件影響分析（Phase 2） ----

export interface Project {
  id: string;
  name: string;
  client_name: string | null;
  work_type: string | null;
  region_id: string | null;
  region_name: string | null;
  bid_date: string | null;
  contract_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  items: ProjectItem[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  client_name: string | null;
  work_type: string | null;
  region_id: string | null;
  region_name: string | null;
  bid_date: string | null;
  contract_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  item_count: number;
  base_total: number;
}

export interface ProjectItem {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  data_kind: string;
  estimate_usable: boolean;
  region_id: string | null;
  region_name: string | null;
  region_code: string | null;
  quantity: number;
  base_unit_price: number;
  procurement_month: string | null;
  note: string | null;
}

export interface SimulationRequest {
  scenarios?: Array<{ name: string; delta: number }>;
  index_item_id?: string | null;
  base_period?: string | null;
}

export interface SimulationItem {
  item_id: string;
  item_name: string;
  data_kind: string;
  estimate_usable: boolean;
  region_name: string | null;
  procurement_month: string | null;
  quantity: number;
  base_unit_price: number;
  base_amount: number;
  actual_rate: number | null;
  scenario_delta: number;
  effective_rate: number;
  impact_amount: number;
  projected_unit_price: number;
}

export interface SimulationScenario {
  name: string;
  delta: number;
  items: SimulationItem[];
  total_base: number;
  total_impact: number;
  total_projected: number;
}

export interface SimulationResult {
  project: { id: string; name: string; status: string };
  index_item_id: string | null;
  base_period: string | null;
  scenarios: SimulationScenario[];
  monthly: Array<{ period: string; impacts: Record<string, number> }>;
  warnings: string[];
}

// ---- 港湾工事コストモデル（PoC） ----

export interface Vessel {
  id: string;
  vessel_code: string;
  vessel_name: string;
  category: string;
  capacity: number | null;
  capacity_unit: string | null;
  hire_rate_per_day: number;
  availability_factor: number;
  mobilization_days: number;
  standby_rate: number;
  is_active: boolean;
  note: string | null;
}

export interface PortWorkType {
  id: string;
  work_type_code: string;
  work_type_name: string;
  unit: string;
  description: string | null;
  vessels: Array<{
    quantity_per_unit: number;
    is_primary: boolean;
    vessel: Vessel;
  }>;
}

export interface PortEstimateRow {
  vessel_code: string;
  vessel_name: string;
  category: string;
  daily_output: number;
  work_days: number;
  standby_days: number;
  hire_cost: number;
  mobilization_cost: number;
  total_cost: number;
}

export interface PortEstimate {
  work_type: { id: string; code: string; name: string; unit: string };
  quantity: number;
  result: {
    operation_rate: number;
    mobilization_days: number;
    rows: PortEstimateRow[];
    total_cost: number;
    assumptions: string[];
  };
}

// ---- 積算エンジン（Phase 4） ----

export interface OverheadRate {
  rate_type: "common_temp" | "site_management" | "general_management";
  rate: number;
  correction_json: Record<string, unknown>;
  applicable_from: string | null;
  applicable_to: string | null;
}

export interface EstimationBase {
  id: string;
  base_code: string;
  base_name: string;
  category: string;
  fiscal_year: number;
  applicable_from: string;
  applicable_to: string | null;
  rounding_rules: Record<string, string>;
  status: string;
  source_type: string | null;
  source_note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  rates: OverheadRate[];
}

export interface EstimationBaseInput {
  base_code: string;
  base_name: string;
  category?: string;
  fiscal_year: number;
  applicable_from: string;
  applicable_to?: string | null;
  rounding_rules?: Record<string, string>;
  status?: string;
  source_type?: string | null;
  source_note?: string | null;
}

export interface WorkTypeTree {
  id: string;
  base_id: string;
  parent_id: string | null;
  level: number;
  code: string;
  name: string;
  unit: string | null;
  standard_name: string | null;
  is_active: boolean;
}

export interface ResourceItem {
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
}

export interface WorkBreakdown {
  id: string;
  base_id: string;
  tree_id: string;
  tree_code: string;
  tree_name: string;
  condition_json: Record<string, unknown>;
  labor: ResourceItem[];
  material: ResourceItem[];
  machinery: ResourceItem[];
  note: string | null;
  source_type: string | null;
  created_by: string;
  updated_at: string;
}

export interface WorkBreakdownInput {
  base_id: string;
  tree_id: string;
  condition_json: Record<string, unknown>;
  labor: ResourceItem[];
  material: ResourceItem[];
  machinery: ResourceItem[];
  note?: string | null;
  source_type?: string | null;
}

export interface QuantityRow {
  id: string;
  project_id: string;
  tree_id: string;
  tree_code: string;
  tree_name: string;
  item_name: string | null;
  standard_name: string | null;
  unit: string | null;
  quantity: number;
  condition_json: Record<string, unknown>;
  source_note: string | null;
  created_by: string;
  updated_at: string;
}

export interface QuantityInput {
  project_id: string;
  tree_id: string;
  item_name?: string | null;
  standard_name?: string | null;
  unit?: string | null;
  quantity: number;
  condition_json: Record<string, unknown>;
  source_note?: string | null;
}

export interface EstimateSummary {
  id: string;
  project_id: string;
  project_name: string;
  base_id: string;
  base_code: string;
  base_name: string;
  name: string;
  status: string;
  direct_cost: number;
  common_temp_cost: number;
  site_management_cost: number;
  general_management_cost: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  created_by: string;
  created_at: string;
}

export interface EstimateLine {
  id: string;
  tree_id: string | null;
  tree_code: string | null;
  tree_name: string | null;
  unit: string | null;
  quantity: number;
  breakdown_id: string | null;
  labor_cost: number;
  material_cost: number;
  machinery_cost: number;
  direct_cost: number;
  note: string | null;
}

export interface EstimateMaterial {
  id: string;
  line_id: string | null;
  resource_type: string;
  resource_name: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  source_note: string | null;
}

export interface EstimateDetail extends EstimateSummary {
  rounding_rule_json: Record<string, string>;
  warnings: string[];
  port_options: {
    operation_rate: number;
    mobilization_days: number | null;
    soil_correction: number;
    night_surcharge: number;
    soil_factor?: number;
    transport_coefficient?: number;
    spoil_unit_price?: number;
    soil_type_code?: string | null;
    spoil_ground_code?: string | null;
    transport_distance_km?: number | null;
  } | null;
  port_extras: {
    operation_rate: number;
    work_days: number;
    standby_days: number;
    mobilization_days: number;
    mobilization_cost: number;
    soil_correction: number;
    night_surcharge: number;
    soil_factor: number;
    transport_coefficient: number;
    soil_type_code: string | null;
    spoil_ground_code: string | null;
    transport_distance_km: number | null;
    disposal_cost: number;
  } | null;
  lines: EstimateLine[];
  materials: EstimateMaterial[];
}

export interface BreakdownSuggestion {
  provider: string;
  model: string | null;
  suggestions: Array<{
    quantity_id: string;
    tree_code: string;
    tree_name: string;
    breakdown_id: string;
    score: number;
    reason: string;
  }>;
}

export interface SeaCondition {
  id: string;
  sea_area_code: string;
  sea_area_name: string;
  target_month: number;
  wave_height_limit: number | null;
  wind_speed_limit: number | null;
  turbidity_allowed: boolean;
  navigation_restriction: string | null;
  workable_days: number;
  calendar_days: number;
  note: string | null;
  updated_at: string;
}

export interface WorkabilityResult {
  sea_area_code: string;
  sea_area_name: string;
  target_month: number;
  workable_days_base: number;
  workable_days: number;
  calendar_days: number;
  operation_rate: number;
  conditions: {
    wave_height_limit: number | null;
    wind_speed_limit: number | null;
    turbidity_allowed: boolean;
    navigation_restriction: string | null;
  };
  warnings: string[];
}

export interface SoilType {
  id: string;
  soil_code: string;
  soil_name: string;
  dredging_correction_factor: number;
  note: string | null;
  updated_at: string;
}

export interface TransportRate {
  id: string;
  distance_km: number;
  transport_coefficient: number;
  note: string | null;
  updated_at: string;
}

export interface SpoilGround {
  id: string;
  spoil_code: string;
  spoil_name: string;
  area_name: string | null;
  distance_km: number | null;
  disposal_unit_price: number;
  note: string | null;
  updated_at: string;
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
