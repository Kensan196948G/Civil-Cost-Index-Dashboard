import type {
  ApiEnvelope,
  DataCategory,
  DataSource,
  DataSourceInput,
  DashboardAlert,
  DashboardSummary,
  FetchJob,
  Item,
  Region,
  TimeseriesParams,
  TimeseriesResponse,
} from "@/types/api";

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
};

export const CATEGORY_LABELS: Record<DataCategory, string> = {
  MATERIAL_PRICE: "資材価格",
  LABOR_COST: "労務単価",
  PRICE_INDEX: "物価指数",
  FUEL_PRICE: "燃料価格",
  OTHER: "その他",
};
