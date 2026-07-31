export function formatRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "—";
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return period;
  return `${Number(m[1])}年${Number(m[2])}月`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(period: string, offset: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + offset;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL_PRICE: "資材価格",
  LABOR_COST: "労務単価",
  PRICE_INDEX: "物価指数",
  FUEL_PRICE: "燃料価格",
  OTHER: "その他",
};

export const STATUS_LABELS: Record<string, string> = {
  confirmed: "確報",
  preliminary: "速報",
  revised: "改定",
  missing: "欠損",
};

export const PRIORITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};
