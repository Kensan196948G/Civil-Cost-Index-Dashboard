"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { formatNumber, formatDateTime, downloadFile } from "@/lib/utils";
import type { BreakdownSuggestion, EstimationBase, EstimateDetail, EstimateSummary, ProjectSummary } from "@/types/api";

export default function EstimatesPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [bases, setBases] = useState<EstimationBase[]>([]);
  const [projectId, setProjectId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [name, setName] = useState("");
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [detail, setDetail] = useState<EstimateDetail | null>(null);
  const [suggestion, setSuggestion] = useState<BreakdownSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, b] = await Promise.all([api.projects(), api.estimationBases()]);
      setProjects(p.projects);
      setBases(b.estimation_bases);
      if (!projectId && p.projects[0]) setProjectId(p.projects[0].id);
      if (!baseId && b.estimation_bases[0]) setBaseId(b.estimation_bases[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, [projectId, baseId]);

  const loadEstimates = useCallback(async () => {
    if (!projectId) return;
    const res = await api.estimates(projectId);
    setEstimates(res.estimates);
  }, [projectId]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { void loadEstimates(); }, [loadEstimates]);

  const calculate = async () => {
    setCalculating(true);
    setNotice(null);
    setSuggestion(null);
    try {
      const res = await api.calculateEstimate({ project_id: projectId, base_id: baseId, name: name || "積算" });
      setDetail(res.estimate);
      setNotice("積算を計算しました（計算はコードで実行、AIは金額に関与していません）。");
      await loadEstimates();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "計算に失敗しました");
    } finally {
      setCalculating(false);
    }
  };

  const open = async (id: string) => {
    try {
      const res = await api.estimate(id);
      setDetail(res.estimate);
      setSuggestion(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "取得に失敗しました");
    }
  };

  const suggest = async () => {
    setNotice(null);
    try {
      const res = await api.aiBreakdownSuggest({ project_id: projectId, base_id: baseId });
      setSuggestion(res.suggestion);
      setNotice(`AI歩掛候補を生成しました（生成元: ${res.suggestion.provider}${res.suggestion.model ? ` / ${res.suggestion.model}` : ""}）。承認前の参考情報です。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "AI候補の生成に失敗しました");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("この積算結果を削除しますか？")) return;
    try {
      await api.deleteEstimate(id);
      setDetail(null);
      await loadEstimates();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";
  const money = (v: number) => formatNumber(v);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">積算計算</h1>
      <p className="text-sm text-gray-600">
        数量×歩掛×単価で直接工事費を計算し、共通仮設費・現場管理費・一般管理費等・消費税まで
        積算基準の端数規則に従って算出します。すべてコードで計算され、AIは歩掛選定などの候補提示のみ担当します。
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
          <label className={labelCls}>積算基準</label>
          <select className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            {bases.map((b) => <option key={b.id} value={b.id}>{b.base_code} {b.base_name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>積算名称</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 本工事積算" />
        </div>
        <button onClick={() => void calculate()} disabled={calculating || !projectId || !baseId} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {calculating ? "計算中…" : "積算を計算"}
        </button>
      </div>
      {loading && <LoadingState />}
      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">積算結果一覧</h2>
            <div className="space-y-1">
              {estimates.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                  <button onClick={() => void open(e.id)} className="flex-1 text-left">
                    <div>{e.name} <span className="text-xs text-gray-400">（{e.base_code}）</span></div>
                    <div className="text-xs text-gray-500">{formatDateTime(e.created_at)} / 合計 {money(e.total)}円</div>
                  </button>
                  <button onClick={() => void remove(e.id)} className="ml-2 text-xs text-red-600 hover:underline">削除</button>
                </div>
              ))}
              {estimates.length === 0 && <div className="py-4 text-center text-sm text-gray-400">まだ積算結果がありません</div>}
            </div>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {!detail && <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">積算を計算するか、一覧から結果を選択してください</div>}
            {detail && (
              <>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-base font-semibold">総括表（{detail.name} / {detail.base_code}）</h2>
                    <div className="flex gap-2">
                      <a href={api.estimateExportUrl(detail.id)} download={`cci-estimate-${detail.id.slice(0, 8)}.xlsx`} className="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        積算書Excel出力
                      </a>
                      <button onClick={() => void suggest()} className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50">AI歩掛候補</button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-gray-100"><td className="py-1">直接工事費</td><td className="py-1 text-right">{money(detail.direct_cost)}</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-1">共通仮設費</td><td className="py-1 text-right">{money(detail.common_temp_cost)}</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-1">現場管理費</td><td className="py-1 text-right">{money(detail.site_management_cost)}</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-1">一般管理費等</td><td className="py-1 text-right">{money(detail.general_management_cost)}</td></tr>
                      <tr className="border-b border-gray-100 font-semibold"><td className="py-1">小計（税抜）</td><td className="py-1 text-right">{money(detail.subtotal)}</td></tr>
                      <tr className="border-b border-gray-100"><td className="py-1">消費税（10%）</td><td className="py-1 text-right">{money(detail.tax_amount)}</td></tr>
                      <tr className="font-bold"><td className="py-1">合計</td><td className="py-1 text-right text-blue-700">{money(detail.total)}</td></tr>
                    </tbody>
                  </table>
                  {detail.warnings.length > 0 && (
                    <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">{detail.warnings.join(" ")}</div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-2 text-base font-semibold">内訳</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">工種</th><th>数量</th><th>労務費</th><th>材料費</th><th>機械費</th><th>直接費</th></tr></thead>
                    <tbody>
                      {detail.lines.map((l) => (
                        <tr key={l.id} className="border-b border-gray-100">
                          <td className="py-1">{l.tree_code} {l.tree_name}{l.note ? <span className="ml-1 text-xs text-amber-600">（{l.note}）</span> : ""}</td>
                          <td className="py-1 text-right">{formatNumber(l.quantity)} {l.unit ?? ""}</td>
                          <td className="py-1 text-right">{money(l.labor_cost)}</td>
                          <td className="py-1 text-right">{money(l.material_cost)}</td>
                          <td className="py-1 text-right">{money(l.machinery_cost)}</td>
                          <td className="py-1 text-right font-semibold">{money(l.direct_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-2 text-base font-semibold">単価表（労務・材料・機械）</h2>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left text-gray-600"><th className="py-1">内訳</th><th>区分</th><th>資源</th><th>数量</th><th>単価</th><th>金額</th></tr></thead>
                    <tbody>
                      {detail.materials.map((m) => (
                        <tr key={m.id} className="border-b border-gray-100">
                          <td className="py-1">{detail.lines.find((l) => l.id === m.line_id)?.tree_name ?? m.line_id ?? ""}</td>
                          <td className="py-1">{m.resource_type}</td>
                          <td className="py-1">{m.resource_name}</td>
                          <td className="py-1 text-right">{formatNumber(m.quantity)} {m.unit ?? ""}</td>
                          <td className="py-1 text-right">{money(m.unit_price)}</td>
                          <td className="py-1 text-right">{money(m.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {suggestion && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <h2 className="mb-1 text-base font-semibold text-blue-900">AI歩掛候補（要確認・承認）</h2>
                    <div className="mb-2 text-xs text-blue-700">生成元: {suggestion.provider}{suggestion.model ? ` / ${suggestion.model}` : ""} — 金額は計算されていません</div>
                    <table className="w-full text-xs">
                      <thead><tr className="border-b text-left text-blue-900"><th className="py-1">数量</th><th>候補歩掛</th><th>スコア</th><th>理由</th></tr></thead>
                      <tbody>
                        {suggestion.suggestions.map((s, i) => (
                          <tr key={i} className="border-b border-blue-100">
                            <td className="py-1">{s.tree_code} {s.tree_name}</td>
                            <td className="py-1 font-mono">{s.breakdown_id || "（なし）"}</td>
                            <td className="py-1">{(s.score * 100).toFixed(0)}%</td>
                            <td className="py-1">{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
