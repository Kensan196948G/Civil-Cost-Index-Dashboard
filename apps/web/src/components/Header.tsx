import Link from "next/link";
import { formatDateTime, formatPeriod } from "@/lib/utils";

export default function Header({
  title = "Civil Cost Index Dashboard",
  subtitle,
  latestPeriod,
  lastUpdated,
  fetchStatus = "正常",
}: {
  title?: string;
  subtitle?: string;
  latestPeriod?: string | null;
  lastUpdated?: string | null;
  fetchStatus?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="flex items-start justify-between gap-4 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <div className="text-right">
            <div className="text-[10px] text-gray-400">最新対象年月 / 最終取込</div>
            <div className="mt-0.5 font-medium">
              {formatPeriod(latestPeriod)}・{formatDateTime(lastUpdated)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400">取込</div>
            <span className={`mt-0.5 inline-flex items-center gap-1 font-medium ${fetchStatus === "正常" ? "text-green-600" : "text-amber-600"}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${fetchStatus === "正常" ? "bg-green-500" : "bg-amber-500"}`} />
              {fetchStatus}
            </span>
          </div>
          <Link href="/export" className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700">
            レポート出力
          </Link>
        </div>
      </div>
    </header>
  );
}
