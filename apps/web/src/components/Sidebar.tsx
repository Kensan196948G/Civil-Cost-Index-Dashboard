"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { group: "分析", items: [
    { href: "/", label: "トップダッシュボード", icon: "▦" },
    { href: "/timeseries", label: "時系列分析", icon: "▤" },
    { href: "/compare", label: "比較分析", icon: "≋" },
    { href: "/table", label: "データテーブル", icon: "☰" },
    { href: "/export", label: "レポート出力", icon: "⤓" },
  ]},
  { group: "AI分析", items: [
    { href: "/ai", label: "AI市況ナビ", icon: "✦" },
  ]},
  { group: "データ管理", items: [
    { href: "/admin/data-sources", label: "データソース管理", icon: "◫" },
    { href: "/admin/fetch-jobs", label: "取込履歴", icon: "↻" },
    { href: "/admin/ai", label: "AI管理", icon: "◈" },
  ]},
  { group: "システム", items: [
    { href: "/settings", label: "ユーザー設定", icon: "⚙" },
  ]},
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden h-screen w-[262px] shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
      <div className="border-b border-gray-100 px-5 py-5">
        <div className="text-base font-bold text-gray-900">Civil Cost Index</div>
        <div className="mt-0.5 text-[11px] text-gray-500">建設資材・労務・物価指数 分析</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {MENU.map((g) => (
          <div key={g.group} className="mb-5">
            <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.group}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const active = pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href));
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                      active ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <span className="w-4 text-center text-xs opacity-70">{it.icon}</span>
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="m-3 rounded-xl bg-gray-50 p-4">
        <div className="text-xs font-semibold text-gray-800">みらい建設 積算部</div>
        <div className="mt-0.5 text-[11px] text-gray-500">積算担当</div>
        <div className="mt-2 inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
          ADMIN
        </div>
      </div>
    </aside>
  );
}
