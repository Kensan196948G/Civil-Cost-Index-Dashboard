"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs, formatNumber } from "@/lib/utils";
import type { DataSource, Item, PriceSnapshot, PriceVersion, Region } from "@/types/api";

const STATUS_LABEL: Record<string, string> = { draft: "下書き", approved: "承認済み", retired: "失効" };

export default function PriceVersionsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [versions, setVersions] = useState<PriceVersion[]>([]);
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<PriceSnapshot | null>(null);
  const [comparison, setComparison] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [form, setForm] = useState({
    data_source_id: "", item_id: "", region_id: "", version_label: "",
    value: "", unit: "円/t", effective_start: "", effective_end: "",
    delivery_terms: "", tax_inclusive: false, freight_included: false,
  });
  const [snapForm, setSnapForm] = useState({ name: "", snapshot_date: new Date().toISOString().slice(0, 10) });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [i, r, d, v, s] = await Promise.all([
        api.items(), api.regions(), api.dataSources(), api.priceVersions(), api.priceSnapshots(),
      ]);
      setItems(i.items); setRegions(r.regions); setSources(d.data_sources);
      setVersions(v.price_versions); setSnapshots(s.snapshots);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
    void load();
  }, [load]);

  const create = async () => {
    setNotice(null);
    try {
      await api.createPriceVersion({
        data_source_id: form.data_source_id,
        item_id: form.item_id,
        region_id: form.region_id || null,
        version_label: form.version_label || null,
        value: Number(form.value),
        unit: form.unit,
        effective_start: form.effective_start,
        effective_end: form.effective_end || null,
        delivery_terms: form.delivery_terms || null,
        tax_inclusive: form.tax_inclusive,
        freight_included: form.freight_included,
      });
      setNotice("単価版（下書き）を作成しました。承認後にスナップショットへ反映できます。");
      setForm({ ...form, value: "", effective_start: "", effective_end: "", version_label: "", delivery_terms: "" });
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "作成に失敗しました");
    }
  };

  const approve = async (id: string) => {
    setNotice(null);
    try {
      await api.approvePriceVersion(id);
      setNotice("承認しました。");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "承認に失敗しました");
    }
  };

  const retire = async (id: string) => {
    try {
      await api.retirePriceVersion(id);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "失効に失敗しました");
    }
  };

  const compare = async (id: string) => {
    setNotice(null);
    try {
      const res = await api.comparePriceVersion(id);
      const d = res.comparison.diff;
      setComparison(
        d
          ? `${res.comparison.current.item_name}: ${formatNumber(d.value.old)} → ${formatNumber(d.value.new)} 円 (${d.diff_rate?.toFixed(1) ?? "—"}%)`
          : `${res.comparison.current.item_name}: 比較対象の旧版がありません`
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "比較に失敗しました");
    }
  };

  const createSnapshot = async () => {
    setNotice(null);
    try {
      const res = await api.createPriceSnapshot(snapForm);
      setSelectedSnapshot(res.snapshot);
      setNotice(`スナップショットを作成しました（${res.snapshot.items?.length ?? 0}件）。`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "スナップショット作成に失敗しました");
    }
  };

  const openSnapshot = async (id: string) => {
    try {
      const res = await api.priceSnapshot(id);
      setSelectedSnapshot(res.snapshot);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取得に失敗しました");
    }
  };

  const removeVersion = async (id: string) => {
    if (!window.confirm("この単価版を削除しますか？")) return;
    try {
      await api.deletePriceVersion(id);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const removeSnapshot = async (id: string) => {
    if (!window.confirm("このスナップショットを削除しますか？")) return;
    try {
      await api.deletePriceSnapshot(id);
      setSelectedSnapshot(null);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">単価版管理</h1>
      <p className="text-sm text-gray-600">
        適用開始日・公表日・遡及改定・税込/税抜・運賃込み/別を管理します。承認された単価版のみがスナップショット（積算時点の固定）に使われます。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {comparison && <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-800">{comparison}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">単価版一覧（旧版比較・承認）</h2>
            {adminKey ? null : (
              <p className="mb-2 text-xs text-amber-700">承認・作成には X-Admin-Key が必要です（ユーザー設定で保存）。</p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-600">
                  <th className="py-2">品目</th>
                  <th>地域</th>
                  <th>版・適用開始</th>
                  <th>単価</th>
                  <th>条件</th>
                  <th>状態</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-gray-100">
                    <td className="py-2">{v.item_name} <span className="text-xs text-gray-400">{v.unit}</span></td>
                    <td className="py-2 text-xs">{v.region_name ?? "全国"}</td>
                    <td className="py-2 text-xs">
                      {v.version_label ?? "—"}
                      <div className="text-gray-400">{v.effective_start}{v.effective_end ? ` 〜 ${v.effective_end}` : ""}</div>
                    </td>
                    <td className="py-2 text-right">{formatNumber(v.value)}</td>
                    <td className="py-2 text-xs">
                      {v.tax_inclusive ? "税込" : "税抜"} / {v.freight_included ? "運賃込" : "運賃別"}
                      {v.retroactive ? " / 遡及" : ""}
                    </td>
                    <td className="py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${v.status === "approved" ? "bg-green-100 text-green-700" : v.status === "draft" ? "bg-amber-100 text-amber-800" : "bg-gray-200 text-gray-600"}`}>
                        {STATUS_LABEL[v.status] ?? v.status}
                      </span>
                    </td>
                    <td className="py-2 whitespace-nowrap text-xs">
                      <button onClick={() => void compare(v.id)} className="mr-2 rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">旧版比較</button>
                      {v.status === "draft" && <button onClick={() => void approve(v.id)} className="mr-2 rounded border border-green-300 px-2 py-1 text-green-700 hover:bg-green-50">承認</button>}
                      {v.status === "approved" && <button onClick={() => void retire(v.id)} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">失効</button>}
                      <button onClick={() => void removeVersion(v.id)} className="ml-2 rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">単価版を登録（下書き）</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>データソース*</label>
                  <select className={inputCls} value={form.data_source_id} onChange={(e) => setForm({ ...form, data_source_id: e.target.value })}>
                    <option value="">選択</option>
                    {sources.map((s) => <option key={s.id} value={s.id}>{s.source_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>品目*</label>
                  <select className={inputCls} value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
                    <option value="">選択</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>地域</label>
                  <select className={inputCls} value={form.region_id} onChange={(e) => setForm({ ...form, region_id: e.target.value })}>
                    <option value="">全国</option>
                    {regions.map((r) => <option key={r.id} value={r.id}>{r.region_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>単価*</label>
                  <input className={inputCls} type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>単位*</label>
                  <input className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>適用開始日*</label>
                  <input className={inputCls} type="date" value={form.effective_start} onChange={(e) => setForm({ ...form, effective_start: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>適用終了日</label>
                  <input className={inputCls} type="date" value={form.effective_end} onChange={(e) => setForm({ ...form, effective_end: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>版ラベル</label>
                  <input className={inputCls} value={form.version_label} onChange={(e) => setForm({ ...form, version_label: e.target.value })} placeholder="令和8年3月適用版" />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>荷渡し条件</label>
                  <input className={inputCls} value={form.delivery_terms} onChange={(e) => setForm({ ...form, delivery_terms: e.target.value })} placeholder="工場渡し / 現場渡し 等" />
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.tax_inclusive} onChange={(e) => setForm({ ...form, tax_inclusive: e.target.checked })} />税込</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.freight_included} onChange={(e) => setForm({ ...form, freight_included: e.target.checked })} />運賃込み</label>
              </div>
              <button onClick={() => void create()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">下書き登録</button>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold">スナップショット（積算時点の単価固定）</h2>
                <a
                  href={api.estimateLinkExportUrl(selectedSnapshot?.id)}
                  download="cci-estimate-link.xlsx"
                  className="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  積算連携Excel出力
                </a>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>名称*</label>
                  <input className={inputCls} value={snapForm.name} onChange={(e) => setSnapForm({ ...snapForm, name: e.target.value })} placeholder="2026年8月 積算時点" />
                </div>
                <div>
                  <label className={labelCls}>基準日</label>
                  <input className={inputCls} type="date" value={snapForm.snapshot_date} onChange={(e) => setSnapForm({ ...snapForm, snapshot_date: e.target.value })} />
                </div>
              </div>
              <button onClick={() => void createSnapshot()} className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">承認済み単価から作成</button>
              <div className="mt-4 space-y-1">
                {snapshots.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                    <button onClick={() => void openSnapshot(s.id)} className="flex-1 text-left">
                    <span>{s.name} <span className="text-xs text-gray-400">（{s.snapshot_date} / {s.item_count}件）</span></span>
                    <span className="text-xs text-blue-600">表示</span>
                    </button>
                    <button onClick={() => void removeSnapshot(s.id)} className="ml-2 text-xs text-red-600 hover:underline">削除</button>
                  </div>
                ))}
              </div>
              {selectedSnapshot && (
                <div className="mt-3 rounded border border-gray-200 p-3">
                  <div className="mb-1 text-sm font-semibold">{selectedSnapshot.name} の内容</div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left text-gray-500"><th className="py-1">品目</th><th>地域</th><th>単価</th><th>出典</th></tr></thead>
                    <tbody>
                      {(selectedSnapshot.items ?? []).map((it) => (
                        <tr key={it.id} className="border-b border-gray-100">
                          <td className="py-1">{it.item_name}</td><td>{it.region_name ?? "全国"}</td>
                          <td className="text-right">{formatNumber(it.value)} {it.unit}</td><td>{it.data_source_name ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
