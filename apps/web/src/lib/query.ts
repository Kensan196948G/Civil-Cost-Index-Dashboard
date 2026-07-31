export type FilterState = {
  dataType: string;
  itemIds: string[];
  regionIds: string[];
  startPeriod: string;
  endPeriod: string;
  normalize: boolean;
  basePeriod: string;
  chartType: string;
};

export const DEFAULT_FILTERS: FilterState = {
  dataType: "MATERIAL_PRICE",
  itemIds: [],
  regionIds: [],
  startPeriod: "",
  endPeriod: "",
  normalize: false,
  basePeriod: "",
  chartType: "line",
};

export function filtersToQuery(f: FilterState): URLSearchParams {
  const q = new URLSearchParams();
  q.set("data_type", f.dataType);
  if (f.itemIds.length) q.set("item_ids", f.itemIds.join(","));
  if (f.regionIds.length) q.set("region_ids", f.regionIds.join(","));
  if (f.startPeriod) q.set("start_period", f.startPeriod);
  if (f.endPeriod) q.set("end_period", f.endPeriod);
  q.set("normalize", String(f.normalize));
  if (f.basePeriod) q.set("base_period", f.basePeriod);
  if (f.chartType && f.chartType !== "line") q.set("chart_type", f.chartType);
  return q;
}

export function filtersFromSearch(search: string): FilterState {
  const p = new URLSearchParams(search);
  const itemIds = (p.get("item_ids") ?? "").split(",").filter(Boolean);
  const regionIds = (p.get("region_ids") ?? "").split(",").filter(Boolean);
  return {
    dataType: p.get("data_type") ?? DEFAULT_FILTERS.dataType,
    itemIds,
    regionIds,
    startPeriod: p.get("start_period") ?? "",
    endPeriod: p.get("end_period") ?? "",
    normalize: p.get("normalize") === "true",
    basePeriod: p.get("base_period") ?? "",
    chartType: p.get("chart_type") ?? "line",
  };
}
