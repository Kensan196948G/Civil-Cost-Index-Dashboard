"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Header from "./Header";

const NAV = [
  { href: "/", label: "トップ" },
  { href: "/timeseries", label: "時系列分析" },
  { href: "/compare", label: "比較分析" },
  { href: "/table", label: "データテーブル" },
  { href: "/export", label: "レポート出力" },
  { href: "/admin/data-sources", label: "データソース管理" },
  { href: "/admin/fetch-jobs", label: "取込履歴" },
  { href: "/settings", label: "設定" },
];

export default function AppShell({
  children,
  lastUpdated,
}: {
  children: ReactNode;
  lastUpdated?: string | null;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-gray-100">
      <Header lastUpdated={lastUpdated ?? null} />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row">
        <aside className="shrink-0 md:w-52">
          <nav className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
            {NAV.map((n) => {
              const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`block rounded-md px-3 py-2 text-sm ${
                    active ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <footer className="border-t border-gray-200 bg-white py-4">
        <div className="mx-auto max-w-7xl px-4 text-xs text-gray-500">
          <p>データ出典は各画面・グラフ下部に表示されます。表示内容は参考情報であり、積算・契約・経営判断の最終根拠には出典元の公表データをご確認ください。</p>
          <p className="mt-1">Civil Cost Index Dashboard v0.1.0（MVP準備中）</p>
        </div>
      </footer>
    </div>
  );
}
