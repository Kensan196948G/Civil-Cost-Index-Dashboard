"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { DataSource, DataSourceInput } from "@/types/api";

const EMPTY: DataSourceInput = {
  source_code: "", source_name: "", source_type: "material", provider_name: "", source_url: "",
  file_format: "csv", update_frequency: "monthly", license_note: "",
  data_kind: "actual_price", estimate_usable: true, redistribution_note: "",
};

const OFFICIAL_PRESETS: DataSourceInput[] = [
  {
    source_code: "ESTAT_MATERIAL_SUPPLY",
    source_name: "e-Stat 主要建設資材需給・価格動向調査",
    source_type: "material",
    provider_name: "国土交通省",
    source_url:
      "https://www.e-stat.go.jp/stat-search?query=%E4%B8%BB%E8%A6%81%E5%BB%BA%E8%A8%AD%E8%B3%87%E6%9D%90%E9%9C%80%E7%B5%A6%E3%83%BB%E4%BE%A1%E6%A0%BC%E5%8B%95%E5%90%91%E8%AA%BF%E6%9F%BB&layout=dataset",
    file_format: "xlsx",
    update_frequency: "monthly",
    data_kind: "trend_assessment",
    estimate_usable: false,
    redistribution_note: "国土交通省公表の調査結果。社外資料への転載は出典明記・提供元の利用条件に従うこと。",
    license_note:
      "国土交通省が毎月公表する建設資材モニター調査。価格・需給・在庫の動向評価（1〜5段階）を都道府県別に収録。実単価・公的指数ではないため積算の単価根拠には使用不可（参考情報のみ）。",
  },
  {
    source_code: "ESTAT_CPI",
    source_name: "e-Stat 消費者物価指数",
    source_type: "index",
    provider_name: "総務省統計局",
    source_url: "https://www.e-stat.go.jp/stat-search/files?toukei=00200573",
    file_format: "api",
    update_frequency: "monthly",
    data_kind: "official_index",
    estimate_usable: true,
    license_note:
      "e-Stat API（getStatsData / getSimpleStatsData）を利用。appId（無料登録）必須。例: statsDataId=0003427113（2020年基準）",
  },
  {
    source_code: "KENPLAZA_MATERIAL",
    source_name: "けんせつPlaza 主要建設資材価格（市場）",
    source_type: "material",
    provider_name: "一般財団法人経済調査会",
    source_url: "https://www.kensetsu-plaza.com/market",
    file_format: "html",
    update_frequency: "monthly",
    data_kind: "actual_price",
    estimate_usable: true,
    license_note: "Web公開中心・APIなし。自動取得は利用規約を確認のうえ手動取込（CSV/Excel化）する。",
  },
  {
    source_code: "MLIT_LABOR",
    source_name: "公共工事設計労務単価",
    source_type: "labor",
    provider_name: "国土交通省",
    source_url:
      "https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo14_hh_000001_00261.html",
    file_format: "pdf",
    update_frequency: "yearly",
    data_kind: "actual_price",
    estimate_usable: true,
    license_note: "毎年3月適用分を公表。PDF/Excel中心で標準APIなし。再配布は出典明記等の条件を確認。",
  },
];

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [form, setForm] = useState<DataSourceInput>(EMPTY);
  const [adminKey, setAdminKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDsId, setUploadDsId] = useState("");
  const [fetchUrl, setFetchUrl] = useState("");
  const [fetchDsId, setFetchDsId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.dataSources();
      setSources(res.data_sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setNotice(null);
    try {
      await api.createDataSource(form, adminKey);
      setForm(EMPTY);
      setNotice("データソースを登録しました。");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const toggle = async (s: DataSource) => {
    setNotice(null);
    try {
      await api.patchDataSource(s.id, { is_active: !s.is_active }, adminKey);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  const doUpload = async () => {
    setNotice(null);
    if (!uploadFile || !uploadDsId) {
      setNotice("ファイルとデータソースを選択してください。");
      return;
    }
    try {
      const job = await api.upload(uploadFile, uploadDsId, adminKey);
      setNotice(`取込完了: ${job.status}（成功 ${job.success_rows} / エラー ${job.error_rows}）`);
      setUploadFile(null);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取込に失敗しました");
    }
  };

  const doFetch = async () => {
    setNotice(null);
    if (!fetchDsId || !fetchUrl.trim()) {
      setNotice("データソースとURLを指定してください。");
      return;
    }
    try {
      const job = await api.fetchFromUrl({ data_source_id: fetchDsId, url: fetchUrl.trim() }, adminKey);
      setNotice(`URL取込完了: ${job.status}（成功 ${job.success_rows} / エラー ${job.error_rows}）`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "URL取込に失敗しました");
    }
  };

  const selectSourceForFetch = (dsId: string) => {
    setFetchDsId(dsId);
    const ds = sources.find((s) => s.id === dsId);
    setFetchUrl(ds?.source_url ?? "");
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">データソース管理</h1>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">データソース一覧</h2>
            {sources.length === 0 ? (
              <EmptyState label="データソースが登録されていません" />
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                  <th className="py-2">コード</th>
                  <th>名称</th>
                  <th>提供元</th>
                  <th>データ種別</th>
                  <th>積算利用</th>
                  <th>形式</th>
                  <th>更新頻度</th>
                  <th>URL</th>
                  <th>最終取得</th>
                  <th>状態</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-2 font-mono text-xs">{s.source_code}</td>
                    <td className="py-2">{s.source_name}</td>
                    <td className="py-2 text-xs">{s.provider_name}</td>
                    <td className="py-2 text-xs">
                      {s.data_kind ? (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${s.data_kind === "trend_assessment" ? "bg-amber-100 text-amber-800" : s.data_kind === "official_index" ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700"}`}>
                          {dataKindLabel(s.data_kind)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-xs">
                      {s.estimate_usable === undefined ? (
                        "—"
                      ) : s.estimate_usable ? (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">積算参考可</span>
                      ) : (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">参考のみ</span>
                      )}
                    </td>
                    <td className="py-2">{s.file_format ?? "—"}</td>
                    <td className="py-2">{s.update_frequency ?? "—"}</td>
                    <td className="py-2">
                      {s.source_url ? (
                        <a href={s.source_url} target="_blank" rel="noreferrer" className="block max-w-[240px] truncate text-xs text-blue-600 hover:underline" title={s.source_url}>
                          {s.source_url}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-xs">{formatDateTime(s.last_fetched_at)}</td>
                    <td className="py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${s.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                        {s.is_active ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className="py-2">
                      <button onClick={() => void toggle(s)} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                        {s.is_active ? "無効化" : "有効化"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-base font-semibold">公式データソースを登録</h2>
            <p className="mb-3 text-xs text-gray-500">
              ボタンで登録フォームに内容を反映してから「登録」を押してください（既に登録済みの場合はコード重複エラーになります）。
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {OFFICIAL_PRESETS.map((p) => (
                <div key={p.source_code} className="rounded border border-gray-200 p-3">
                  <div className="mb-1 text-sm font-semibold">{p.source_name}</div>
                  <div className="mb-2 text-xs text-gray-500">
                    {p.provider_name} / {p.file_format} / {p.update_frequency === "monthly" ? "月次" : p.update_frequency === "yearly" ? "年次" : "不定期"}
                  </div>
                  <button
                    onClick={() => setForm({ ...EMPTY, ...p })}
                    className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                  >
                    この内容で登録
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">新規登録</h2>
            <div className="mb-3">
              <label className={labelCls}>管理者キー（X-Admin-Key。未設定なら401表示）</label>
              <input type="password" className={inputCls} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="本番では設定必須" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div>
                <label className={labelCls}>コード*</label>
                <input className={inputCls} value={form.source_code} onChange={(e) => setForm({ ...form, source_code: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>名称*</label>
                <input className={inputCls} value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>種別</label>
                <select className={inputCls} value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
                  <option value="material">資材</option>
                  <option value="labor">労務</option>
                  <option value="index">指数</option>
                  <option value="fuel">燃料</option>
                  <option value="other">その他</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>提供元*</label>
                <input className={inputCls} value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>URL</label>
                <input className={inputCls} value={form.source_url ?? ""} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>形式</label>
                <select className={inputCls} value={form.file_format ?? "csv"} onChange={(e) => setForm({ ...form, file_format: e.target.value })}>
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel</option>
                  <option value="pdf">PDF</option>
                  <option value="api">API</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>更新頻度</label>
                <select className={inputCls} value={form.update_frequency ?? "monthly"} onChange={(e) => setForm({ ...form, update_frequency: e.target.value })}>
                  <option value="monthly">月次</option>
                  <option value="yearly">年次</option>
                  <option value="irregular">不定期</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>利用規約・注記</label>
                <input className={inputCls} value={form.license_note ?? ""} onChange={(e) => setForm({ ...form, license_note: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>データ種別</label>
                <select className={inputCls} value={form.data_kind ?? "actual_price"} onChange={(e) => setForm({ ...form, data_kind: e.target.value })}>
                  <option value="actual_price">実単価</option>
                  <option value="official_index">公的指数</option>
                  <option value="trend_assessment">動向評価値（参考のみ）</option>
                  <option value="internal_actual">社内実績単価</option>
                  <option value="adopted_price">採用単価</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>積算利用</label>
                <select className={inputCls} value={form.estimate_usable ? "usable" : "reference"} onChange={(e) => setForm({ ...form, estimate_usable: e.target.value === "usable" })}>
                  <option value="usable">積算参考可</option>
                  <option value="reference">参考のみ</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>再配布注記</label>
                <input className={inputCls} value={form.redistribution_note ?? ""} onChange={(e) => setForm({ ...form, redistribution_note: e.target.value })} />
              </div>
            </div>
            <button onClick={() => void create()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
              登録
            </button>
          </div>
          <div className="cci-card p-4">
            <h2 className="mb-1 text-base font-semibold">データ取込（CSV / Excel）</h2>
            <p className="mb-3 text-xs text-gray-500">
              標準CSV形式（年月,品目,規格,地域,値,単位,状態,出典,注記）または Excel の最初のシートを取込みます。取込結果は「取込履歴」で確認できます。
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className={labelCls}>データソース*</label>
                <select className={inputCls} value={uploadDsId} onChange={(e) => setUploadDsId(e.target.value)}>
                  <option value="">選択してください</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.source_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>ファイル*</label>
                <input type="file" accept=".csv,.xlsx" className={inputCls} onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <label className={labelCls}>管理者キー（X-Admin-Key）</label>
                <input type="password" className={inputCls} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="本番では設定必須" />
              </div>
            </div>
            <button onClick={() => void doUpload()} className="cci-btn-primary mt-3" disabled={!uploadFile || !uploadDsId}>
              アップロードして取込
            </button>
          </div>
          <div className="cci-card p-4">
            <h2 className="mb-1 text-base font-semibold">URLから取得（CSV / Excel）</h2>
            <p className="mb-3 text-xs text-gray-500">
              公開URLから直接取得して取込みます（最大10MB・30秒タイムアウト・SSRFガード付き）。e-Stat 主要建設資材需給・価格動向調査のExcelは専用変換で全国平均値を取込みますが、動向評価値（1〜5段階）のため「参考のみ」扱いです。
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className={labelCls}>データソース*</label>
                <select
                  className={inputCls}
                  value={fetchDsId}
                  onChange={(e) => selectSourceForFetch(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.source_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>URL*</label>
                <input className={inputCls} value={fetchUrl} onChange={(e) => setFetchUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className={labelCls}>管理者キー（X-Admin-Key）</label>
                <input type="password" className={inputCls} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="本番では設定必須" />
              </div>
            </div>
            <button onClick={() => void doFetch()} className="cci-btn-primary mt-3" disabled={!fetchDsId || !fetchUrl.trim()}>
              URLから取得して取込
            </button>
          </div>
        </>
      )}
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
