import type {
  AiAlertsResponse,
  AiAudience,
  AiAuditLog,
  AiQualityResponse,
  AiReportResponse,
  AiStatus,
  AiSummaryResponse,
  AiTemplate,
  ApplicableBaseResult,
  ApiEnvelope,
  AuthMe,
  BreakdownSuggestion,
  ChangeOrderDetail,
  ChangeOrderSummary,
  DataCategory,
  DataSource,
  DataSourceInput,
  DashboardAlert,
  DashboardSummary,
  EstimationBase,
  EstimationBaseInput,
  EstimationBaseComparison,
  EstimateDetail,
  EstimateSummary,
  FetchJob,
  FetchSchedule,
  FetchScheduleInput,
  FetchUrlInput,
  ForecastResult,
  Item,
  OperationAuditLog,
  PortEstimate,
  PortReadiness,
  PortWorkType,
  QuantityInput,
  QuantityAiCandidate,
  QuantityAiSuggestion,
  QuantityRow,
  ConstructionRecord,
  ConstructionSummaryRow,
  PriceSnapshot,
  PriceVersion,
  PriceVersionComparison,
  PriceVersionInput,
  Project,
  ProjectItem,
  ProjectSummary,
  QuotationDetail,
  QuotationReviewResult,
  QuotationSummary,
  RagAnswerResult,
  RagChunk,
  ForecastEvaluation,
  Region,
  SimulationRequest,
  SimulationResult,
  SeaCondition,
  ShiftRule,
  SoilType,
  SpoilGround,
  StagedIngestion,
  TimeseriesParams,
  TimeseriesResponse,
  User,
  Vessel,
  WorkBreakdown,
  WorkBreakdownInput,
  WorkTypeTree,
  WorkabilityResult,
  TransportRate,
} from "@/types/api";
import { loadPrefs } from "@/lib/utils";

export class ApiError extends Error {
  code: string;
  details?: unknown[];
  status: number;

  constructor(code: string, message: string, status: number, details?: unknown[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const API_BASE: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function toCsvParams(p: TimeseriesParams): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { data_type: p.data_type };
  if (p.item_ids) out.item_ids = p.item_ids;
  if (p.region_ids) out.region_ids = p.region_ids;
  if (p.start_period) out.start_period = p.start_period;
  if (p.end_period) out.end_period = p.end_period;
  if (p.normalize !== undefined) out.normalize = p.normalize;
  if (p.base_period) out.base_period = p.base_period;
  return out;
}

type ErrorPayload = { success: false; error: { code: string; message: string; details?: unknown[] } };

function isSuccessPayload<T>(p: unknown): p is ApiEnvelope<T> {
  return typeof p === "object" && p !== null && (p as { success?: unknown }).success === true;
}

function isErrorPayload(p: unknown): p is ErrorPayload {
  return typeof p === "object" && p !== null && (p as { success?: unknown }).success === false && "error" in p;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
  let payload: unknown = null;
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    // non-JSON response
  }
  if (!res.ok || !isSuccessPayload<T>(payload)) {
    const err = isErrorPayload(payload) ? payload.error : { code: "HTTP_ERROR", message: `HTTP ${res.status}`, details: [] };
    throw new ApiError(err.code, err.message, res.status, err.details);
  }
  return payload.data;
}

export const api = {
  authMe: () => request<AuthMe>("/api/auth/me"),
  users: () => request<{ users: User[] }>("/api/users", { headers: { "X-Admin-Key": adminKeyHeader() } }),
  createUser: (input: { email: string; display_name?: string; roles?: string[] }) =>
    request<User>("/api/users", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  patchUser: (id: string, input: { display_name?: string | null; roles?: string[]; is_active?: boolean }) =>
    request<User>(`/api/users/${id}`, { method: "PATCH", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  deleteUser: (id: string) =>
    request<{ deleted: boolean }>(`/api/users/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  operationAudit: (params?: { actor?: string; action?: string; limit?: number }) =>
    request<{ logs: OperationAuditLog[] }>(`/api/audit/operations${buildQuery(params ?? {})}`, { headers: { "X-Admin-Key": adminKeyHeader() } }),
  priceVersions: (params?: { item_id?: string; region_id?: string; status?: string }) =>
    request<{ price_versions: PriceVersion[] }>(`/api/price-versions${buildQuery(params ?? {})}`),
  createPriceVersion: (input: PriceVersionInput) =>
    request<{ price_version: PriceVersion }>("/api/price-versions", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  approvePriceVersion: (id: string) =>
    request<{ price_version: PriceVersion }>(`/api/price-versions/${id}/approve`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() } }),
  retirePriceVersion: (id: string) =>
    request<{ price_version: PriceVersion }>(`/api/price-versions/${id}/retire`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() } }),
  deletePriceVersion: (id: string) =>
    request<{ deleted: boolean }>(`/api/price-versions/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  comparePriceVersion: (id: string, oldId?: string) =>
    request<{ comparison: PriceVersionComparison }>(`/api/price-versions/${id}/compare${oldId ? `?old_id=${oldId}` : ""}`),
  priceSnapshots: () => request<{ snapshots: PriceSnapshot[] }>("/api/price-snapshots"),
  createPriceSnapshot: (input: { name: string; description?: string; snapshot_date?: string }) =>
    request<{ snapshot: PriceSnapshot }>("/api/price-snapshots", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  priceSnapshot: (id: string) => request<{ snapshot: PriceSnapshot }>(`/api/price-snapshots/${id}`),
  deletePriceSnapshot: (id: string) =>
    request<{ deleted: boolean }>(`/api/price-snapshots/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  fetchSchedules: () => request<{ schedules: FetchSchedule[] }>("/api/fetch-schedules", { headers: { "X-Admin-Key": adminKeyHeader() } }),
  createFetchSchedule: (input: FetchScheduleInput) =>
    request<{ schedule_id: string }>("/api/fetch-schedules", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  patchFetchSchedule: (id: string, input: Partial<FetchScheduleInput>) =>
    request<{ schedule_id: string }>(`/api/fetch-schedules/${id}`, { method: "PATCH", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  runFetchSchedule: (id: string) =>
    request<{ result: Record<string, unknown> }>(`/api/fetch-schedules/${id}/run`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() } }),
  deleteFetchSchedule: (id: string) =>
    request<{ deleted: boolean }>(`/api/fetch-schedules/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  stagedIngestions: (status?: string) =>
    request<{ staged: StagedIngestion[] }>(`/api/staged-ingestions${status ? `?status=${status}` : ""}`, { headers: { "X-Admin-Key": adminKeyHeader() } }),
  approveStaged: (id: string) =>
    request<{ result: Record<string, unknown> }>(`/api/staged-ingestions/${id}/approve`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() } }),
  rejectStaged: (id: string) =>
    request<{ rejected: boolean }>(`/api/staged-ingestions/${id}/reject`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() } }),
  deleteStaged: (id: string) =>
    request<{ deleted: boolean }>(`/api/staged-ingestions/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  projects: () => request<{ projects: ProjectSummary[] }>("/api/projects"),
  createProject: (input: Partial<Project>) =>
    request<{ project: Project }>("/api/projects", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  project: (id: string) => request<{ project: Project }>(`/api/projects/${id}`),
  patchProject: (id: string, input: Partial<Project>) =>
    request<{ project: Project }>(`/api/projects/${id}`, { method: "PATCH", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/api/projects/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  addProjectItem: (projectId: string, input: Partial<ProjectItem>) =>
    request<{ item_id: string }>(`/api/projects/${projectId}/items`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  deleteProjectItem: (projectId: string, itemId: string) =>
    request<{ deleted: boolean }>(`/api/projects/${projectId}/items/${itemId}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  simulateProject: (projectId: string, input: SimulationRequest) =>
    request<{ simulation: SimulationResult }>(`/api/projects/${projectId}/simulate`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  portVessels: () => request<{ vessels: Vessel[] }>("/api/port-models/vessels"),
  portWorkTypes: () => request<{ work_types: PortWorkType[] }>("/api/port-models/work-types"),
  portEstimate: (input: { work_type_id: string; quantity: number; operation_rate?: number; mobilization_days?: number }) =>
    request<{ estimate: PortEstimate }>("/api/port-models/estimate", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  estimationBases: () => request<{ estimation_bases: EstimationBase[] }>("/api/estimation-bases"),
  createEstimationBase: (input: EstimationBaseInput) =>
    request<{ estimation_base_id: string }>("/api/estimation-bases", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  patchEstimationBase: (id: string, input: Partial<EstimationBaseInput>) =>
    request<{ estimation_base_id: string }>(`/api/estimation-bases/${id}`, { method: "PATCH", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  upsertOverheadRate: (baseId: string, rateType: string, input: { rate: number; correction_json?: Record<string, unknown> }) =>
    request<{ rate_id: string }>(`/api/estimation-bases/${baseId}/rates/${rateType}`, { method: "PUT", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  workTypeTrees: (baseId?: string) =>
    request<{ trees: WorkTypeTree[] }>(`/api/work-type-trees${baseId ? `?base_id=${baseId}` : ""}`),
  createWorkTypeTree: (input: Partial<WorkTypeTree> & { base_id: string; code: string; name: string }) =>
    request<{ tree_id: string }>("/api/work-type-trees", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  workBreakdowns: (params?: { base_id?: string; tree_id?: string }) =>
    request<{ breakdowns: WorkBreakdown[] }>(`/api/work-breakdowns${buildQuery(params ?? {})}`),
  createWorkBreakdown: (input: WorkBreakdownInput) =>
    request<{ breakdown_id: string }>("/api/work-breakdowns", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  patchWorkBreakdown: (id: string, input: Partial<WorkBreakdownInput>) =>
    request<{ breakdown_id: string }>(`/api/work-breakdowns/${id}`, { method: "PATCH", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  importWorkBreakdowns: (file: File, baseId: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("base_id", baseId);
    return request<{ result: { imported: number; errors: Array<{ row: number; column: string; reason: string }> } }>("/api/work-breakdowns/import", {
      method: "POST",
      headers: { "X-Admin-Key": adminKeyHeader() },
      body: fd,
    });
  },
  quantities: (projectId: string) => request<{ quantities: QuantityRow[] }>(`/api/quantities?project_id=${projectId}`),
  addQuantity: (input: QuantityInput) =>
    request<{ quantity_id: string }>("/api/quantities", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  patchQuantity: (id: string, input: Partial<QuantityInput>) =>
    request<{ quantity_id: string }>(`/api/quantities/${id}`, { method: "PATCH", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  deleteQuantity: (id: string) =>
    request<{ deleted: boolean }>(`/api/quantities/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  aiExtractQuantities: (file: File, projectId: string, baseId: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("project_id", projectId);
    fd.append("base_id", baseId);
    return request<{ result: { provider: string; model: string | null; candidates: QuantityAiCandidate[]; suggestion_ids: string[] } }>("/api/quantities/ai-extract", {
      method: "POST",
      headers: { "X-Admin-Key": adminKeyHeader() },
      body: fd,
    });
  },
  quantityAiSuggestions: (projectId: string, status?: string) =>
    request<{ suggestions: QuantityAiSuggestion[] }>(`/api/quantities/ai-suggestions?project_id=${projectId}${status ? `&status=${status}` : ""}`),
  approveQuantitySuggestion: (id: string) =>
    request<{ result: { quantity_id: string; suggestion_id: string } }>(`/api/quantities/ai-suggestions/${id}/approve`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() } }),
  rejectQuantitySuggestion: (id: string) =>
    request<{ rejected: boolean }>(`/api/quantities/ai-suggestions/${id}/reject`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() } }),
  calculateEstimate: (input: {
    project_id: string;
    base_id: string;
    name: string;
    port_options?: {
      operation_rate?: number;
      mobilization_days?: number | null;
      soil_correction?: number;
      night_surcharge?: number;
      soil_type_code?: string | null;
      spoil_ground_code?: string | null;
      transport_distance_km?: number | null;
      shift_rules?: string[];
    };
  }) =>
    request<{ estimate: EstimateDetail }>("/api/estimates/calculate", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  estimates: (projectId?: string) =>
    request<{ estimates: EstimateSummary[] }>(`/api/estimates${projectId ? `?project_id=${projectId}` : ""}`),
  estimate: (id: string) => request<{ estimate: EstimateDetail }>(`/api/estimates/${id}`),
  estimateExportUrl: (id: string) => `/api/estimates/${id}/export`,
  estimatePdfExportUrl: (id: string) => `/api/estimates/${id}/export.pdf`,
  managementPdfUrl: () => `/api/reports/management.pdf`,
  managementPptxUrl: () => `/api/reports/management.pptx`,
  deleteEstimate: (id: string) =>
    request<{ deleted: boolean }>(`/api/estimates/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  aiBreakdownSuggest: (input: { project_id: string; base_id: string }) =>
    request<{ suggestion: BreakdownSuggestion }>("/api/ai/breakdown-suggest", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  changeOrders: (projectId?: string) =>
    request<{ change_orders: ChangeOrderSummary[] }>(`/api/change-orders${projectId ? `?project_id=${projectId}` : ""}`),
  createChangeOrder: (input: { project_id: string; base_id?: string | null; estimate_id?: string | null; name: string; change_date?: string | null; reason?: string | null }) =>
    request<{ change_order_id: string }>("/api/change-orders", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  changeOrder: (id: string) => request<{ change_order: ChangeOrderDetail }>(`/api/change-orders/${id}`),
  deleteChangeOrder: (id: string) =>
    request<{ deleted: boolean }>(`/api/change-orders/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  addChangeOrderLine: (id: string, input: {
    tree_id?: string | null;
    tree_code?: string | null;
    tree_name?: string | null;
    unit?: string | null;
    before_quantity: number;
    after_quantity: number;
    before_unit_price: number;
    after_unit_price: number;
    note?: string | null;
  }) =>
    request<{ line_id: string }>(`/api/change-orders/${id}/lines`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  deleteChangeOrderLine: (changeOrderId: string, lineId: string) =>
    request<{ deleted: boolean }>(`/api/change-orders/${changeOrderId}/lines/${lineId}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  changeOrderExportUrl: (id: string) => `/api/change-orders/${id}/export`,
  compareEstimationBases: (id: string, otherId: string) =>
    request<{ comparison: EstimationBaseComparison }>(`/api/estimation-bases/${id}/compare?other_id=${otherId}`),
  applyCheckBases: (date: string) =>
    request<{ result: ApplicableBaseResult }>(`/api/estimation-bases/apply-check?date=${date}`),
  forecast: (input: { item_id: string; region_id?: string | null; horizon_months?: number }) =>
    request<{ forecast: ForecastResult }>("/api/ai/forecast", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  constructionRecords: (params?: { item_id?: string; region_id?: string; project_id?: string }) =>
    request<{ records: ConstructionRecord[] }>(`/api/construction-records${buildQuery(params ?? {})}`),
  createConstructionRecord: (input: { item_id: string; work_date: string; quantity: number; amount: number; unit?: string | null; source_note?: string | null }) =>
    request<{ record_id: string }>("/api/construction-records", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  deleteConstructionRecord: (id: string) =>
    request<{ deleted: boolean }>(`/api/construction-records/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  constructionSummary: (params?: { item_id?: string; region_id?: string }) =>
    request<{ summary: ConstructionSummaryRow[] }>(`/api/construction-records/summary${buildQuery(params ?? {})}`),
  suggestPriceFromRecords: (input: { item_id: string; region_id?: string | null }) =>
    request<{ result: { price_version_id: string; summary: ConstructionSummaryRow } }>("/api/construction-records/suggest-price", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  importConstructionRecords: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ result: { imported: number; errors: Array<{ row: number; column: string; reason: string }> } }>("/api/construction-records/import", {
      method: "POST",
      headers: { "X-Admin-Key": adminKeyHeader() },
      body: fd,
    });
  },
  drawingExtract: (file: File, projectId: string, baseId: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("project_id", projectId);
    fd.append("base_id", baseId);
    return request<{ result: { provider: string; model: string | null; candidates: QuantityAiCandidate[]; suggestion_ids: string[] } }>("/api/ai/drawing-extract", {
      method: "POST",
      headers: { "X-Admin-Key": adminKeyHeader() },
      body: fd,
    });
  },
  ragIndex: () =>
    request<{ result: { inserted: number; embedding: string } }>("/api/rag/index", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() } }),
  ragSearch: (query: string, limit?: number) =>
    request<{ chunks: RagChunk[] }>("/api/rag/search", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify({ query, limit }) }),
  ragAsk: (query: string, limit?: number) =>
    request<{ result: RagAnswerResult }>("/api/rag/ask", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify({ query, limit }) }),
  quotationReview: (id: string) =>
    request<{ review: QuotationReviewResult }>(`/api/ai/quotation-review/${id}`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() } }),
  forecastEvaluate: (input: { item_id: string; actual_value: number; actual_period: string }) =>
    request<{ evaluation: ForecastEvaluation }>("/api/ai/forecast/evaluate", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  forecastEvaluations: (itemId?: string) =>
    request<{ evaluations: ForecastEvaluation[] }>(`/api/ai/forecast/evaluations${itemId ? `?item_id=${itemId}` : ""}`),
  portReadiness: () => request<{ readiness: PortReadiness }>("/api/port-models/readiness"),
  managementData: (audience?: string) =>
    request<{ data: Record<string, unknown> }>(`/api/reports/management.json${audience ? `?audience=${audience}` : ""}`),
  quotations: (projectId?: string) =>
    request<{ quotations: QuotationSummary[] }>(`/api/quotations${projectId ? `?project_id=${projectId}` : ""}`),
  createQuotation: (input: {
    project_id: string;
    supplier_name: string;
    quote_date?: string | null;
    valid_until?: string | null;
    status?: string;
    tax_inclusive?: boolean;
    freight_included?: boolean;
    note?: string | null;
  }) =>
    request<{ quotation_id: string }>("/api/quotations", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  quotation: (id: string) => request<{ quotation: QuotationDetail }>(`/api/quotations/${id}`),
  patchQuotation: (id: string, input: Partial<{ supplier_name: string; quote_date: string | null; valid_until: string | null; status: string; tax_inclusive: boolean; freight_included: boolean; note: string | null }>) =>
    request<{ quotation_id: string }>(`/api/quotations/${id}`, { method: "PATCH", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  deleteQuotation: (id: string) =>
    request<{ deleted: boolean }>(`/api/quotations/${id}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  addQuotationItem: (id: string, input: {
    item_id?: string | null;
    tree_id?: string | null;
    item_name: string;
    standard_name?: string | null;
    unit?: string | null;
    unit_price: number;
    note?: string | null;
  }) =>
    request<{ item_id: string }>(`/api/quotations/${id}/items`, { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  patchQuotationItem: (quotationId: string, itemId: string, input: { is_adopted?: boolean; adoption_reason?: string | null; unit_price?: number; note?: string | null }) =>
    request<{ item_id: string }>(`/api/quotations/${quotationId}/items/${itemId}`, { method: "PATCH", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  deleteQuotationItem: (quotationId: string, itemId: string) =>
    request<{ deleted: boolean }>(`/api/quotations/${quotationId}/items/${itemId}`, { method: "DELETE", headers: { "X-Admin-Key": adminKeyHeader() } }),
  quotationExportUrl: (id: string) => `/api/quotations/${id}/export`,
  seaConditions: (seaAreaCode?: string) =>
    request<{ sea_conditions: SeaCondition[] }>(`/api/port-models/sea-conditions${seaAreaCode ? `?sea_area_code=${seaAreaCode}` : ""}`),
  upsertSeaCondition: (input: {
    sea_area_code: string;
    sea_area_name: string;
    target_month: number;
    wave_height_limit?: number | null;
    wind_speed_limit?: number | null;
    turbidity_allowed?: boolean;
    navigation_restriction?: string | null;
    workable_days: number;
    calendar_days?: number;
    note?: string | null;
  }) =>
    request<{ sea_condition_id: string }>("/api/port-models/sea-conditions", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  computeWorkability: (input: { sea_area_code: string; target_month: number; wave_height?: number | null; wind_speed?: number | null }) =>
    request<{ workability: WorkabilityResult }>("/api/port-models/workability", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  importOverheadRates: (file: File, baseId: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("base_id", baseId);
    return request<{ result: { imported: number; errors: Array<{ row: number; column: string; reason: string }> } }>(`/api/estimation-bases/${baseId}/rates/import`, {
      method: "POST",
      headers: { "X-Admin-Key": adminKeyHeader() },
      body: fd,
    });
  },
  importVessels: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ result: { imported: number; errors: Array<{ row: number; column: string; reason: string }> } }>("/api/vessels/import", {
      method: "POST",
      headers: { "X-Admin-Key": adminKeyHeader() },
      body: fd,
    });
  },
  soilTypes: () => request<{ soil_types: SoilType[] }>("/api/port-models/soil-types"),
  upsertSoilType: (input: { soil_code: string; soil_name: string; dredging_correction_factor: number; note?: string | null }) =>
    request<{ soil_type_id: string }>("/api/port-models/soil-types", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  transportRates: () => request<{ transport_rates: TransportRate[] }>("/api/port-models/transport-rates"),
  upsertTransportRate: (input: { distance_km: number; transport_coefficient: number; note?: string | null }) =>
    request<{ transport_rate_id: string }>("/api/port-models/transport-rates", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  spoilGrounds: () => request<{ spoil_grounds: SpoilGround[] }>("/api/port-models/spoil-grounds"),
  upsertSpoilGround: (input: { spoil_code: string; spoil_name: string; area_name?: string | null; distance_km?: number | null; disposal_unit_price: number; note?: string | null }) =>
    request<{ spoil_ground_id: string }>("/api/port-models/spoil-grounds", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  shiftRules: () => request<{ shift_rules: ShiftRule[] }>("/api/port-models/shift-rules"),
  upsertShiftRule: (input: {
    rule_code: string;
    rule_name: string;
    shift_type: "night" | "rotation" | "overtime";
    time_from?: string | null;
    time_to?: string | null;
    labor_surcharge_rate: number;
    machinery_surcharge_rate: number;
    note?: string | null;
  }) =>
    request<{ shift_rule_id: string }>("/api/port-models/shift-rules", { method: "POST", headers: { "X-Admin-Key": adminKeyHeader() }, body: JSON.stringify(input) }),
  regions: () => request<{ regions: Region[] }>("/api/regions"),
  items: (category?: DataCategory) =>
    request<{ items: Item[] }>(`/api/items${category ? `?category=${category}` : ""}`),
  dashboardSummary: (params?: { region_id?: string; period?: string; base_period?: string }) =>
    request<DashboardSummary>(`/api/dashboard/summary${buildQuery(params ?? {})}`),
  timeseries: (params: TimeseriesParams) =>
    request<TimeseriesResponse>(`/api/timeseries${buildQuery(toCsvParams(params))}`),
  compare: (params: { series: string; start_period?: string; end_period?: string; normalize?: boolean; base_period?: string }) =>
    request<TimeseriesResponse>(`/api/compare${buildQuery(params)}`),
  alerts: (params?: { threshold_mom?: number; threshold_yoy?: number; limit?: number }) =>
    request<{ alerts: DashboardAlert[] }>(`/api/alerts${buildQuery(params ?? {})}`),
  dataSources: () => request<{ data_sources: DataSource[] }>("/api/data-sources"),
  createDataSource: (input: DataSourceInput, adminKey: string) =>
    request<DataSource>("/api/data-sources", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
      body: JSON.stringify(input),
    }),
  patchDataSource: (id: string, input: Partial<DataSourceInput>, adminKey: string) =>
    request<DataSource>(`/api/data-sources/${id}`, {
      method: "PATCH",
      headers: { "X-Admin-Key": adminKey },
      body: JSON.stringify(input),
    }),
  fetchJobs: (params?: { status?: string; limit?: number }) =>
    request<{ fetch_jobs: FetchJob[] }>(`/api/fetch-jobs${buildQuery(params ?? {})}`),
  fetchFromUrl: (input: FetchUrlInput, adminKey: string) =>
    request<FetchJob>("/api/fetch-jobs", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
      body: JSON.stringify(input),
    }),
  upload: (file: File, dataSourceId: string, adminKey: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("data_source_id", dataSourceId);
    return request<FetchJob>("/api/uploads", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey },
      body: fd,
    });
  },
  csvExportUrl: (params: TimeseriesParams) => `/api/export/csv${buildQuery(toCsvParams(params))}`,
  xlsxExportUrl: (params: TimeseriesParams) => `/api/export/xlsx${buildQuery(toCsvParams(params))}`,
  pdfExportUrl: (params: TimeseriesParams) => `/api/export/pdf${buildQuery(toCsvParams(params))}`,
  pptxExportUrl: (params: TimeseriesParams) => `/api/export/pptx${buildQuery(toCsvParams(params))}`,
  estimateLinkExportUrl: (snapshotId?: string) =>
    `/api/export/estimate-link${snapshotId ? `?snapshot_id=${snapshotId}` : ""}`,
  aiStatus: () => request<AiStatus>("/api/ai/status"),
  aiTemplates: () => request<{ templates: AiTemplate[] }>("/api/ai/templates"),
  aiSummary: (params?: { audience?: AiAudience; region_id?: string }) =>
    request<AiSummaryResponse>("/api/ai/summary", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    }),
  aiAlertsExplain: (params?: { threshold_mom?: number; threshold_yoy?: number; limit?: number }) =>
    request<AiAlertsResponse>("/api/ai/alerts/explain", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    }),
  aiReport: (params: { report_type: string; region_id?: string }) =>
    request<AiReportResponse>("/api/ai/report", {
      method: "POST",
      body: JSON.stringify(params),
    }),
  aiQuality: () => request<AiQualityResponse>("/api/ai/quality"),
  aiFeedback: (params: { audit_id: string; rating: string; comment?: string }) =>
    request<{ updated: boolean }>("/api/ai/feedback", {
      method: "POST",
      body: JSON.stringify(params),
    }),
  aiAudit: (adminKey: string, params?: { feature?: string; limit?: number }) =>
    request<{ logs: AiAuditLog[] }>(`/api/ai/audit${buildQuery(params ?? {})}`, {
      headers: { "X-Admin-Key": adminKey },
    }),
};

function adminKeyHeader(): string {
  return loadPrefs().adminKey ?? "";
}

export const CATEGORY_LABELS: Record<DataCategory, string> = {
  MATERIAL_PRICE: "資材価格",
  LABOR_COST: "労務単価",
  PRICE_INDEX: "物価指数",
  FUEL_PRICE: "燃料価格",
  OTHER: "その他",
};
