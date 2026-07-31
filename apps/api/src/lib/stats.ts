import type { RatePoint } from "../types";

export function toHalfWidth(value: string): string {
  return value
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ",")
    .replace(/[．。]/g, ".");
}

export function parseNumeric(value: string): number | null {
  if (value == null) return null;
  const cleaned = toHalfWidth(value.trim())
    .replace(/,/g, "")
    .replace(/[¥￥円]/g, "")
    .replace(/[()（）].*$/, "")
    .trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "—" || cleaned === "NA" || cleaned === "n/a") {
    return null;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parsePeriod(value: string): string | null {
  if (!value) return null;
  const s = toHalfWidth(value).trim();
  let m = s.match(/^(\d{4})[-/年](\d{1,2})月?$/);
  if (!m) {
    // 和暦: R6.4 / 令和6年4月 / H30.4 / S63.4
    m = s.match(/^(令和|R)(\d{1,2})[年.](\d{1,2})月?$/);
    if (m) {
      const year = 2018 + Number(m[2]);
      return `${year}-${String(Number(m[3])).padStart(2, "0")}`;
    }
    m = s.match(/^(平成|H)(\d{1,2})[年.](\d{1,2})月?$/);
    if (m) {
      const eraYear = Number(m[2]);
      const year = eraYear === 0 ? 1989 : eraYear <= 30 ? 1988 + eraYear : 2019 + (eraYear - 30);
      return `${year}-${String(Number(m[3])).padStart(2, "0")}`;
    }
    m = s.match(/^(昭和|S)(\d{1,2})[年.](\d{1,2})月?$/);
    if (m) {
      const year = 1925 + Number(m[2]);
      return `${year}-${String(Number(m[3])).padStart(2, "0")}`;
    }
    return null;
  }
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}`;
}

export function periodToDate(period: string): string {
  return `${period}-01`;
}

export function dateToPeriod(date: string): string {
  return date.slice(0, 7);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function addMonths(period: string, offset: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + offset;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function computeRates(points: RatePoint[]): Map<string, { mom: number | null; yoy: number | null }> {
  const byPeriod = new Map(points.map((p) => [p.period, p.value]));
  const rates = new Map<string, { mom: number | null; yoy: number | null }>();
  for (const p of points) {
    const prev = byPeriod.get(addMonths(p.period, -1));
    const yoyValue = byPeriod.get(addMonths(p.period, -12));
    const mom = prev != null && prev !== 0 ? round2((p.value / prev - 1) * 100) : null;
    const yoy = yoyValue != null && yoyValue !== 0 ? round2((p.value / yoyValue - 1) * 100) : null;
    rates.set(p.period, { mom, yoy });
  }
  return rates;
}

export function normalizeSeries(
  points: RatePoint[],
  basePeriod: string | null
): { values: Map<string, number>; baseRaw: number | null; baseUsed: string | null } {
  const sorted = [...points].sort((a, b) => a.period.localeCompare(b.period));
  const base = basePeriod ? sorted.find((p) => p.period === basePeriod) : sorted[0];
  if (!base) {
    // 基準年月が系列内にない場合は最も近い過去値（先頭）を基準にする
    const fallback = sorted[0];
    if (!fallback) return { values: new Map(), baseRaw: null, baseUsed: null };
    const fallbackRaw = fallback.value !== 0 ? fallback.value : null;
    if (fallbackRaw == null) {
      return { values: new Map(sorted.map((p) => [p.period, p.value])), baseRaw: null, baseUsed: null };
    }
    return {
      values: new Map(sorted.map((p) => [p.period, round2((p.value / fallbackRaw) * 100)])),
      baseRaw: fallbackRaw,
      baseUsed: fallback.period,
    };
  }
  const baseRaw = base && base.value !== 0 ? base.value : null;
  if (baseRaw == null) {
    return { values: new Map(sorted.map((p) => [p.period, p.value])), baseRaw: null, baseUsed: null };
  }
  return {
    values: new Map(sorted.map((p) => [p.period, round2((p.value / baseRaw) * 100)])),
    baseRaw,
    baseUsed: base.period,
  };
}

export type AlertCandidate = {
  item_name: string;
  region_name: string;
  period: string;
  mom_rate: number | null;
  yoy_rate: number | null;
};

export function detectAlerts(
  seriesList: Array<{ item_name: string; region_name: string; points: RatePoint[] }>,
  thresholdMom = 5,
  thresholdYoy = 10,
  limit = 20
): Array<{
  item_name: string;
  region_name: string;
  period: string;
  mom_rate: number | null;
  yoy_rate: number | null;
  reason: string;
  priority: string;
}> {
  const alerts: Array<{
    item_name: string;
    region_name: string;
    period: string;
    mom_rate: number | null;
    yoy_rate: number | null;
    reason: string;
    priority: string;
  }> = [];

  for (const series of seriesList) {
    const sorted = [...series.points].sort((a, b) => a.period.localeCompare(b.period));
    const rates = computeRates(sorted);
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    const r = rates.get(last.period);
    const mom = r?.mom ?? null;
    const yoy = r?.yoy ?? null;
    const absYoy = yoy == null ? 0 : Math.abs(yoy);
    const absMom = mom == null ? 0 : Math.abs(mom);

    let reason = "";
    let priority = "low";
    if (absYoy >= 20) {
      reason = `前年比${yoy! >= 0 ? "+" : ""}${yoy}%（±20%以上）`;
      priority = "high";
    } else if (absYoy >= thresholdYoy) {
      reason = `前年比${yoy! >= 0 ? "+" : ""}${yoy}%（±${thresholdYoy}%以上）`;
      priority = "medium";
    } else if (absMom >= thresholdMom) {
      reason = `前月比${mom! >= 0 ? "+" : ""}${mom}%（±${thresholdMom}%以上）`;
      priority = "medium";
    } else {
      // 3か月以上連続同方向
      const tail = sorted.slice(-3).map((p) => rates.get(p.period)?.mom ?? 0);
      if (tail.length === 3 && tail.every((v) => v > 0)) {
        reason = "3か月以上連続上昇";
        priority = "low";
      } else if (tail.length === 3 && tail.every((v) => v < 0)) {
        reason = "3か月以上連続下落";
        priority = "low";
      }
    }
    if (!reason) continue;
    alerts.push({
      item_name: series.item_name,
      region_name: series.region_name,
      period: last.period,
      mom_rate: mom,
      yoy_rate: yoy,
      reason,
      priority,
    });
  }

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return alerts
    .sort((a, b) => order[a.priority] - order[b.priority] || (b.yoy_rate ?? 0) - (a.yoy_rate ?? 0))
    .slice(0, limit);
}
