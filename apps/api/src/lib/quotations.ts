/**
 * 見積比較・査定の純粋関数
 */

export type QuoteItemInput = {
  key: string;
  item_name: string;
  standard_name: string | null;
  unit: string | null;
  unit_price: number;
  supplier_name: string;
  quote_date: string;
};

export type QuoteComparisonRow = {
  key: string;
  item_name: string;
  standard_name: string | null;
  unit: string | null;
  supplier_name: string;
  unit_price: number;
  average: number | null;
  min_price: number | null;
  max_price: number | null;
  deviation_rate: number | null;
  previous_price: number | null;
  previous_change_rate: number | null;
  warnings: string[];
};

export function compareQuoteItems(
  items: QuoteItemInput[],
  previousByKey: Map<string, number> = new Map()
): QuoteComparisonRow[] {
  const groups = new Map<string, QuoteItemInput[]>();
  for (const item of items) {
    const list = groups.get(item.key) ?? [];
    list.push(item);
    groups.set(item.key, list);
  }
  const rows: QuoteComparisonRow[] = [];
  for (const [key, list] of groups) {
    const prices = list.map((i) => i.unit_price);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    for (const item of list) {
      const deviationRate = average !== 0 ? (item.unit_price / average - 1) * 100 : null;
      const previousPrice = previousByKey.get(`${item.supplier_name}|${key}`) ?? null;
      const previousChangeRate =
        previousPrice != null && previousPrice !== 0
          ? (item.unit_price / previousPrice - 1) * 100
          : null;
      const warnings: string[] = [];
      if (deviationRate != null && Math.abs(deviationRate) >= 20) {
        warnings.push(`平均比 ${deviationRate >= 0 ? "+" : ""}${deviationRate.toFixed(1)}%（±20%超）`);
      }
      if (previousChangeRate != null && Math.abs(previousChangeRate) >= 10) {
        warnings.push(`前回比 ${previousChangeRate >= 0 ? "+" : ""}${previousChangeRate.toFixed(1)}%（±10%超）`);
      }
      rows.push({
        key,
        item_name: item.item_name,
        standard_name: item.standard_name,
        unit: item.unit,
        supplier_name: item.supplier_name,
        unit_price: item.unit_price,
        average: Math.round(average * 100) / 100,
        min_price: minPrice,
        max_price: maxPrice,
        deviation_rate: deviationRate != null ? Math.round(deviationRate * 10) / 10 : null,
        previous_price: previousPrice,
        previous_change_rate:
          previousChangeRate != null ? Math.round(previousChangeRate * 10) / 10 : null,
        warnings,
      });
    }
  }
  return rows.sort((a, b) => a.item_name.localeCompare(b.item_name, "ja") || a.supplier_name.localeCompare(b.supplier_name, "ja"));
}

export function quoteExpiryStatus(validUntil: string | null, today = new Date()): {
  expired: boolean;
  expiring_soon: boolean;
  days_left: number | null;
} {
  if (!validUntil) return { expired: false, expiring_soon: false, days_left: null };
  const d = new Date(validUntil);
  const daysLeft = Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
  return {
    expired: daysLeft < 0,
    expiring_soon: daysLeft >= 0 && daysLeft <= 30,
    days_left: daysLeft,
  };
}
