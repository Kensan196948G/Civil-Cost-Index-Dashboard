export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("ja-JP", { maximumFractionDigits: digits });
}

export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "—";
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) return `${m[1]}年${Number(m[2])}月`;
  return period;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function csvFileName(prefix = "cci-export"): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${prefix}-${ymd}.csv`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadCsv(url: string, filename: string): Promise<void> {
  return downloadFile(url, filename, "CSV");
}

export async function downloadFile(url: string, filename: string, label = "ファイル"): Promise<void> {
  const adminKey = loadPrefs().adminKey;
  const res = await fetch(url, adminKey ? { headers: { "X-Admin-Key": adminKey } } : undefined);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label}ダウンロードに失敗しました (${res.status})${text ? `: ${text}` : ""}`);
  }
  downloadBlob(await res.blob(), filename);
}

export function loadPrefs(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("cci-prefs") ?? "{}");
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Record<string, string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("cci-prefs", JSON.stringify(prefs));
}
