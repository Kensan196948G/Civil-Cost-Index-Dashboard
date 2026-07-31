"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { loadPrefs, savePrefs } from "@/lib/utils";
import type { Region } from "@/types/api";

export default function SettingsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionCode, setRegionCode] = useState("JP-01");
  const [period, setPeriod] = useState("3y");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    void api.regions().then((r) => setRegions(r.regions)).catch(() => undefined);
    const p = loadPrefs();
    setRegionCode(p.regionCode ?? "JP-01");
    setPeriod(p.period ?? "3y");
    setTheme((p.theme as "light" | "dark") ?? "light");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const save = () => {
    savePrefs({ regionCode, period, theme });
    alert("設定を保存しました。");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ユーザー設定</h1>
      <div className="max-w-lg rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">初期表示地域</label>
            <select className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={regionCode} onChange={(e) => setRegionCode(e.target.value)}>
              {regions.map((r) => (
                <option key={r.id} value={r.region_code}>
                  {r.region_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">初期表示期間</label>
            <select className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="latest">最新のみ</option>
              <option value="1y">1年</option>
              <option value="3y">3年</option>
              <option value="5y">5年</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">テーマ</label>
            <select className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}>
              <option value="light">ライト</option>
              <option value="dark">ダーク</option>
            </select>
          </div>
          <button onClick={save} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
