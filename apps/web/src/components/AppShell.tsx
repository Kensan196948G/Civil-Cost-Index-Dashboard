"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AppShell({
  children,
  header,
}: {
  children: ReactNode;
  header?: ReactNode;
}) {
  const pathname = usePathname();
  const mobileNav = [
    { href: "/", label: "トップ" },
    { href: "/timeseries", label: "時系列" },
    { href: "/compare", label: "比較" },
    { href: "/table", label: "テーブル" },
    { href: "/export", label: "出力" },
    { href: "/projects", label: "案件影響" },
    { href: "/port", label: "港湾" },
    { href: "/estimates", label: "積算" },
    { href: "/ai", label: "AI市況" },
    { href: "/admin/estimation-bases", label: "積算基準" },
    { href: "/admin/breakdowns", label: "歩掛" },
    { href: "/admin/quantities", label: "数量" },
    { href: "/admin/change-orders", label: "設計変更" },
    { href: "/admin/quotations", label: "見積比較" },
    { href: "/admin/construction-records", label: "施工実績" },
    { href: "/admin/data-sources", label: "データソース" },
    { href: "/admin/fetch-jobs", label: "取込履歴" },
    { href: "/admin/schedules", label: "定期取得" },
    { href: "/admin/staged", label: "承認待ち" },
    { href: "/admin/price-versions", label: "単価版" },
    { href: "/admin/ai", label: "AI管理" },
    { href: "/admin/users", label: "ユーザー" },
    { href: "/admin/audit", label: "操作監査" },
    { href: "/admin/management", label: "経営KPI" },
    { href: "/settings", label: "設定" },
  ];
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {header ?? <Header title="Civil Cost Index Dashboard" />}
        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-3 py-2 md:hidden">
          {mobileNav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
                pathname === n.href ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 px-6 py-5">{children}</main>
        <footer className="border-t border-gray-200 bg-white px-6 py-3 text-[11px] text-gray-400">
          Civil Cost Index Dashboard v0.1.0 ｜ 表示値は参考情報です。出典元の公表値をご確認ください。
        </footer>
      </div>
    </div>
  );
}
