"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs, formatNumber, formatDateTime } from "@/lib/utils";
import type { Item, ProjectSummary, QuotationDetail, QuotationReviewResult, QuotationSummary } from "@/types/api";

export default function QuotationsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [projectId, setProjectId] = useState("");
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [detail, setDetail] = useState<QuotationDetail | null>(null);
  const [review, setReview] = useState<QuotationReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [coForm, setCoForm] = useState({
    supplier_name: "", quote_date: new Date().toISOString().slice(0, 10), valid_until: "",
    tax_inclusive: false, freight_included: false, note: "",
  });
  const [itemForm, setItemForm] = useState({ item_id: "", item_name: "", unit: "", unit_price: "", note: "" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, i] = await Promise.all([api.projects(), api.items()]);
      setProjects(p.projects);
      setItems(i.items);
      if (!projectId && p.projects[0]) setProjectId(p.projects[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadQuotations = useCallback(async () => {
    if (!projectId) return;
    const res = await api.quotations(projectId);
    setQuotations(res.quotations);
  }, [projectId]);

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
    void loadAll();
  }, [loadAll]);
  useEffect(() => { void loadQuotations(); }, [loadQuotations]);

  const create = async () => {
    setNotice(null);
    try {
      const res = await api.createQuotation({
        project_id: projectId,
        supplier_name: coForm.supplier_name,
        quote_date: coForm.quote_date || null,
        valid_until: coForm.valid_until || null,
        tax_inclusive: coForm.tax_inclusive,
        freight_included: coForm.freight_included,
        note: coForm.note || null,
      });
      setNotice("見積を登録しました。");
      setCoForm({ ...coForm, supplier_name: "", valid_until: "", note: "" });
      await loadQuotations();
      await open(res.quotation_id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "登録に失敗しました");
    }
  };

  const open = async (id: string) => {
    try {
      const res = await api.quotation(id);
      setDetail(res.quotation);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取得に失敗しました");
    }
  };

  const addItem = async () => {
    setNotice(null);
    if (!detail) return;
    const selectedItem = items.find((i) => i.id === itemForm.item_id);
    try {
      await api.addQuotationItem(detail.id, {
        item_id: itemForm.item_id || null,
        item_name: itemForm.item_name || selectedItem?.item_name || "",
        unit: itemForm.unit || selectedItem?.default_unit || undefined,
        unit_price: Number(itemForm.unit_price),
        note: itemForm.note || null,
      });
      setNotice("見積明細を追加しました。");
      setItemForm({ item_id: "", item_name: "", unit: "", unit_price: "", note: "" });
      await open(detail.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "追加に失敗しました");
    }
  };

  const adopt = async (itemId: string, isAdopted: boolean) => {
    if (!detail) return;
    const reason = isAdopted ? window.prompt("採用理由を入力してください", "価格・納期・実績を総合評価") ?? "" : null;
    if (isAdopted && !reason) return;
    try {
      await api.patchQuotationItem(detail.id, itemId, { is_adopted: isAdopted, adoption_reason: reason });
      await open(detail.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  const removeItem = async (itemId: string) => {
    if (!detail) return;
    try {
      await api.deleteQuotationItem(detail.id, itemId);
      await open(detail.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const removeQuotation = async (id: string) => {
    if (!window.confirm("この見積を削除しますか？")) return;
    try {
      await api.deleteQuotation(id);
      setDetail(null);
      await loadQuotations();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const runReview = async () => {
    setNotice(null);
    if (!detail) return;
    try {
      const res = await api.quotationReview(detail.id);
      setReview(res.review);
      setNotice(`AI査定コメントを生成しました（生成元: ${res.review.provider}${res.review.model ? ` / ${res.review.model}` : ""}）。承認が必要です。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "査定コメント生成に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";
  const money = (v: number | null) => (v == null ? "—" : formatNumber(v));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">見積比較・査定支援</h1>
      <p className="text-sm text-gray-600">
        協力会社の見積を取込・正規化し、同一品目の平均比・前回比の異常値を警告します。採用明細と採用理由を記録し、有効期限も管理します。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void loadAll()} />}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>案件</label>
          <select className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>管理者キー</label>
          <input type="password" className={inputCls} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
        </div>
      </div>
      {loading && <LoadingState />}
      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">見積一覧</h2>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="業者名*" value={coForm.supplier_name} onChange={(e) => setCoForm({ ...coForm, supplier_name: e.target.value })} />
              <input className={inputCls} type="date" value={coForm.quote_date} onChange={(e) => setCoForm({ ...coForm, quote_date: e.target.value })} />
              <input className={inputCls} type="date" value={coForm.valid_until} onChange={(e) => setCoForm({ ...coForm, valid_until: e.target.value })} />
              <input className={inputCls} placeholder="備考" value={coForm.note} onChange={(e) => setCoForm({ ...coForm, note: e.target.value })} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={coForm.tax_inclusive} onChange={(e) => setCoForm({ ...coForm, tax_inclusive: e.target.checked })} />税込</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={coForm.freight_included} onChange={(e) => setCoForm({ ...coForm, freight_included: e.target.checked })} />運賃込</label>
            </div>
            <button onClick={() => void create()} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">見積を登録</button>
            <div className="mt-3 space-y-1">
              {quotations.map((q) => (
                <div key={q.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                  <button onClick={() => void open(q.id)} className="flex-1 text-left">
                    <div>{q.supplier_name} <span className="text-xs text-gray-400">（{q.quote_date}）</span>
                      {q.expiry.expired && <span className="ml-1 rounded bg-rose-100 px-1 py-0.5 text-[10px] text-rose-700">期限切れ</span>}
                      {q.expiry.expiring_soon && !q.expiry.expired && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">期限間近</span>}
                    </div>
                    <div className="text-xs text-gray-500">{q.item_count}明細 / {q.status}</div>
                  </button>
                  <button onClick={() => void removeQuotation(q.id)} className="ml-2 text-xs text-red-600 hover:underline">削除</button>
                </div>
              ))}
              {quotations.length === 0 && <div className="py-4 text-center text-sm text-gray-400">見積がありません</div>}
            </div>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {!detail && <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">見積を選択してください</div>}
            {detail && (
              <>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-base font-semibold">見積比較（{detail.supplier_name}）</h2>
                    <div className="flex gap-2">
                      <button onClick={() => void runReview()} className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50">AI査定コメント</button>
                      <a href={api.quotationExportUrl(detail.id)} download={`cci-quotation-${detail.id.slice(0, 8)}.xlsx`} className="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        見積比較Excel出力
                      </a>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left text-gray-600"><th className="py-1">品目</th><th>業者</th><th>単価</th><th>平均</th><th>平均比</th><th>前回比</th><th>警告</th></tr></thead>
                    <tbody>
                      {detail.comparison.map((c, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-1">{c.item_name}<div className="text-gray-400">{c.standard_name ?? ""} {c.unit ?? ""}</div></td>
                          <td className="py-1">{c.supplier_name}</td>
                          <td className="py-1 text-right">{money(c.unit_price)}</td>
                          <td className="py-1 text-right">{money(c.average)}</td>
                          <td className={`py-1 text-right ${c.deviation_rate != null && Math.abs(c.deviation_rate) >= 20 ? "text-red-600 font-semibold" : ""}`}>
                            {c.deviation_rate != null ? `${c.deviation_rate >= 0 ? "+" : ""}${c.deviation_rate}%` : "—"}
                          </td>
                          <td className="py-1 text-right">{c.previous_change_rate != null ? `${c.previous_change_rate >= 0 ? "+" : ""}${c.previous_change_rate}%` : "—"}</td>
                          <td className="py-1 text-amber-700">{c.warnings.join("／")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {review && (
                    <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm">
                      <div className="mb-1 font-semibold text-blue-900">AI査定コメント（要確認・承認）</div>
                      <div className="text-xs text-blue-800">{review.review.summary}</div>
                      {review.review.comments.map((c, i) => <div key={i} className="mt-1 text-xs text-amber-700">• {c}</div>)}
                      {review.review.recommendations.length > 0 && (
                        <div className="mt-1 text-xs text-blue-800">推奨: {review.review.recommendations.join("／")}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-2 text-base font-semibold">この見積の明細</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">品目</th><th>単価</th><th>採用</th><th>採用理由</th><th></th></tr></thead>
                    <tbody>
                      {detail.items.map((i) => (
                        <tr key={i.id} className="border-b border-gray-100">
                          <td className="py-1">{i.item_name}<div className="text-xs text-gray-400">{i.standard_name ?? ""} {i.unit ?? ""}</div></td>
                          <td className="py-1 text-right">{money(i.unit_price)}</td>
                          <td className="py-1">
                            <button
                              onClick={() => void adopt(i.id, !i.is_adopted)}
                              className={`rounded px-2 py-0.5 text-xs ${i.is_adopted ? "bg-green-100 text-green-700" : "border border-gray-300 text-gray-500 hover:bg-gray-50"}`}
                            >
                              {i.is_adopted ? "採用済み" : "採用"}
                            </button>
                          </td>
                          <td className="py-1 text-xs">{i.adoption_reason ?? "—"}</td>
                          <td className="py-1"><button onClick={() => void removeItem(i.id)} className="text-xs text-red-600 hover:underline">削除</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h3 className="mb-2 mt-3 text-sm font-semibold">明細を追加</h3>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    <select className={inputCls} value={itemForm.item_id} onChange={(e) => {
                      const it = items.find((x) => x.id === e.target.value);
                      setItemForm({ ...itemForm, item_id: e.target.value, item_name: it?.item_name ?? "", unit: it?.default_unit ?? "" });
                    }}>
                      <option value="">品目（任意）</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
                    </select>
                    <input className={inputCls} placeholder="品目名*" value={itemForm.item_name} onChange={(e) => setItemForm({ ...itemForm, item_name: e.target.value })} />
                    <input className={inputCls} placeholder="単位" value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} />
                    <input className={inputCls} type="number" placeholder="単価*" value={itemForm.unit_price} onChange={(e) => setItemForm({ ...itemForm, unit_price: e.target.value })} />
                    <button onClick={() => void addItem()} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">追加</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
