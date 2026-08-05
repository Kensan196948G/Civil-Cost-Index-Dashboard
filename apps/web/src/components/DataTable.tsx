"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { classNames, formatNumber, formatRate } from "@/lib/utils";

export interface TableRow {
  period: string;
  label: string;
  value: number | null;
  unit: string;
  dataKind?: string;
  estimateUsable?: boolean;
  mom: number | null;
  yoy: number | null;
  status: string;
  source: string;
}

const PAGE_SIZE = 10;

export default function DataTable({ rows }: { rows: TableRow[] }) {
  const [sortKey, setSortKey] = useState<keyof TableRow>("period");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const arr = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "ja");
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortAsc]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const toggleSort = (key: keyof TableRow) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const Th = ({ k, children }: { k: keyof TableRow; children: ReactNode }) => (
    <th
      className="cursor-pointer whitespace-nowrap border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600"
      onClick={() => toggleSort(k)}
    >
      {children} {sortKey === k ? (sortAsc ? "▲" : "▼") : ""}
    </th>
  );

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th k="period">年月</Th>
              <Th k="label">品目・地域</Th>
              <Th k="value">値</Th>
              <Th k="unit">単位</Th>
              <Th k="dataKind">データ種別</Th>
              <Th k="mom">前月比</Th>
              <Th k="yoy">前年比</Th>
              <Th k="status">状態</Th>
              <Th k="source">出典</Th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{r.period}</td>
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.value, 4)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.unit}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.dataKind && (
                    <span
                      className={classNames(
                        "mr-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium",
                        r.dataKind === "trend_assessment"
                          ? "bg-amber-100 text-amber-800"
                          : r.dataKind === "official_index"
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-slate-100 text-slate-700"
                      )}
                    >
                      {dataKindLabel(r.dataKind)}
                    </span>
                  )}
                  {r.estimateUsable === false && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">参考のみ</span>}
                </td>
                <td className={classNames("px-3 py-2 text-right", r.mom !== null && r.mom > 0 ? "text-red-600" : r.mom !== null && r.mom < 0 ? "text-blue-600" : "text-gray-500")}>
                  {formatRate(r.mom)}
                </td>
                <td className={classNames("px-3 py-2 text-right", r.yoy !== null && r.yoy > 0 ? "text-red-600" : r.yoy !== null && r.yoy < 0 ? "text-blue-600" : "text-gray-500")}>
                  {formatRate(r.yoy)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{statusLabel(r.status)}</td>
                <td className="px-3 py-2">{r.source}</td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
        <span>
          {sorted.length} 件中 {(current - 1) * PAGE_SIZE + 1}〜{Math.min(current * PAGE_SIZE, sorted.length)} 件
        </span>
        <div className="flex gap-2">
          <button className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            前へ
          </button>
          <span>
            {current} / {pageCount}
          </span>
          <button className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}

function dataKindLabel(kind: string): string {
  const map: Record<string, string> = {
    actual_price: "実単価",
    official_index: "公的指数",
    trend_assessment: "動向評価値",
    internal_actual: "社内実績",
    adopted_price: "採用単価",
  };
  return map[kind] ?? kind;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    confirmed: "確報",
    preliminary: "速報",
    revised: "改定",
    missing: "欠損",
  };
  return map[status] ?? status;
}
