import Link from "next/link";
import { formatDateTime } from "@/lib/utils";

export default function Header({ lastUpdated }: { lastUpdated: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">🏗️</span>
          <span className="text-lg font-bold text-gray-900">Civil Cost Index Dashboard</span>
        </Link>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>最終更新: {formatDateTime(lastUpdated)}</span>
          <Link href="/export" className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">
            出力
          </Link>
        </div>
      </div>
    </header>
  );
}
