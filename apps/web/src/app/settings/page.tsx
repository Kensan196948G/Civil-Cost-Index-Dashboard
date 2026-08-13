"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { loadPrefs, savePrefs } from "@/lib/utils";
import type { AuthMe, Region } from "@/types/api";

export default function SettingsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionCode, setRegionCode] = useState("JP-01");
  const [period, setPeriod] = useState("3y");
  const [adminKey, setAdminKey] = useState("");
  const [me, setMe] = useState<AuthMe | null>(null);

  useEffect(() => {
    void api.regions().then((r) => setRegions(r.regions)).catch(() => undefined);
    void api.authMe().then(setMe).catch(() => undefined);
    const p = loadPrefs();
    setRegionCode(p.regionCode ?? "JP-01");
    setPeriod(p.period ?? "3y");
    setAdminKey(p.adminKey ?? "");
  }, []);
  const save = () => {
    savePrefs({ regionCode, period, adminKey });
    alert("設定を保存しました。");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">ユーザー設定</h1>
      {me && (
        <div className="max-w-lg rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-base font-semibold">現在の利用者</h2>
          <div className="text-sm">
            <div>{me.display_name ?? me.email} <span className="text-xs text-gray-400">（{me.source === "admin-key" ? "Admin Key" : me.source === "access-jwt" ? "Cloudflare Access" : "未認証"}）</span></div>
            <div className="mt-1 text-xs text-gray-500">役割: {me.role_labels.join(" / ")}</div>
          </div>
        </div>
      )}
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
            <label className="mb-1 block text-xs font-semibold text-gray-600">管理者キー（X-Admin-Key）</label>
            <input
              type="password"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="管理API操作用の共有キー"
            />
          </div>
          <button onClick={save} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
