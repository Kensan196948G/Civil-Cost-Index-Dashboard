"use client";

import { CATEGORY_LABELS } from "@/lib/api";
import type { DataCategory, Item, Region } from "@/types/api";
import { classNames } from "@/lib/utils";

export interface FilterValues {
  dataType: DataCategory;
  itemIds: string[];
  regionIds: string[];
  startPeriod: string;
  endPeriod: string;
  normalize: boolean;
  basePeriod: string;
  chartType: "line" | "bar";
}

const PERIOD_PRESETS = [
  { label: "1年", months: 12 },
  { label: "3年", months: 36 },
  { label: "全期間", months: 0 },
] as const;

export default function FilterPanel({
  values,
  items,
  regions,
  onChange,
}: {
  values: FilterValues;
  items: Item[];
  regions: Region[];
  onChange: (next: Partial<FilterValues>) => void;
}) {
  const filteredItems = items.filter((i) => i.category === values.dataType);
  const today = new Date();
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const applyPeriod = (months: number) => {
    if (months === 0) {
      onChange({ startPeriod: "", endPeriod: "" });
      return;
    }
    const d = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1);
    onChange({ startPeriod: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, endPeriod: thisMonth });
  };

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="cci-card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800">絞り込み条件</span>
        <button className="text-xs text-blue-600 hover:underline" onClick={() => onChange({ itemIds: [], regionIds: [], startPeriod: "", endPeriod: "", normalize: false, basePeriod: "" })}>
          初期化
        </button>
      </div>

      <div>
        <div className="cci-label">データ分類</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORY_LABELS) as DataCategory[]).map((c) => (
            <button
              key={c}
              onClick={() => onChange({ dataType: c, itemIds: [] })}
              className={classNames("cci-chip", values.dataType === c && "cci-chip-active")}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="cci-label">品目（{values.itemIds.length} / {filteredItems.length} 選択）</div>
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {filteredItems.map((i) => (
            <button
              key={i.id}
              onClick={() => onChange({ itemIds: toggleId(values.itemIds, i.id) })}
              className={classNames("cci-chip", values.itemIds.includes(i.id) && "cci-chip-active")}
              title={i.standard_name ?? ""}
            >
              {i.item_name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="cci-label">地域</div>
        <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
          {regions.map((r) => (
            <button
              key={r.id}
              onClick={() => onChange({ regionIds: toggleId(values.regionIds, r.id) })}
              className={classNames("cci-chip", values.regionIds.includes(r.id) && "cci-chip-active")}
            >
              {r.region_name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="cci-label">期間</div>
          <div className="flex gap-1.5">
            {PERIOD_PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPeriod(p.months)} className="cci-chip">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="cci-input w-36" value={values.startPeriod} onChange={(e) => onChange({ startPeriod: e.target.value })} />
          <span className="text-xs text-gray-400">〜</span>
          <input type="month" className="cci-input w-36" value={values.endPeriod} onChange={(e) => onChange({ endPeriod: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={values.normalize} onChange={(e) => onChange({ normalize: e.target.checked })} className="h-4 w-4 accent-blue-600" />
          指数化（基準年月＝100）
        </label>
        <input type="month" className="cci-input w-36" value={values.basePeriod} disabled={!values.normalize} onChange={(e) => onChange({ basePeriod: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          グラフ
          <select
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={values.chartType}
            onChange={(e) => onChange({ chartType: e.target.value as "line" | "bar" })}
          >
            <option value="line">折れ線</option>
            <option value="bar">棒</option>
          </select>
        </label>
      </div>
    </div>
  );
}
