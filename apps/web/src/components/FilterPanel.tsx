"use client";

import { CATEGORY_LABELS } from "@/lib/api";
import type { DataCategory, Item, Region } from "@/types/api";

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
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";
  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <div>
          <label className={labelCls}>データ分類</label>
          <select
            className={inputCls}
            value={values.dataType}
            onChange={(e) => onChange({ dataType: e.target.value as DataCategory, itemIds: [] })}
          >
            {(Object.keys(CATEGORY_LABELS) as DataCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>品目（複数選択可）</label>
          <select
            className={inputCls}
            multiple
            size={3}
            value={values.itemIds}
            onChange={(e) => onChange({ itemIds: [...e.target.selectedOptions].map((o) => o.value) })}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.item_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>地域（複数選択可）</label>
          <select
            className={inputCls}
            multiple
            size={3}
            value={values.regionIds}
            onChange={(e) => onChange({ regionIds: [...e.target.selectedOptions].map((o) => o.value) })}
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.region_name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>開始</label>
            <input
              type="month"
              className={inputCls}
              value={values.startPeriod}
              onChange={(e) => onChange({ startPeriod: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>終了</label>
            <input type="month" className={inputCls} value={values.endPeriod} onChange={(e) => onChange({ endPeriod: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>基準年月</label>
            <input
              type="month"
              className={inputCls}
              value={values.basePeriod}
              onChange={(e) => onChange({ basePeriod: e.target.value })}
              disabled={!values.normalize}
            />
          </div>
          <div>
            <label className={labelCls}>グラフ</label>
            <select className={inputCls} value={values.chartType} onChange={(e) => onChange({ chartType: e.target.value as "line" | "bar" })}>
              <option value="line">折れ線</option>
              <option value="bar">棒</option>
            </select>
          </div>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={values.normalize}
              onChange={(e) => onChange({ normalize: e.target.checked })}
              className="h-4 w-4"
            />
            指数化（基準年月=100）
          </label>
        </div>
      </div>
    </div>
  );
}
