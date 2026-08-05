"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorMessage, LoadingState } from "@/components/Status";
import { api } from "@/lib/api";
import { loadPrefs, formatNumber } from "@/lib/utils";
import type { EstimationBase, ProjectSummary, QuantityAiCandidate, QuantityRow, WorkTypeTree } from "@/types/api";

export default function QuantitiesPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [bases, setBases] = useState<EstimationBase[]>([]);
  const [trees, setTrees] = useState<WorkTypeTree[]>([]);
  const [projectId, setProjectId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [quantities, setQuantities] = useState<QuantityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [form, setForm] = useState({
    tree_id: "", quantity: "", unit: "", condition_json: "{}", item_name: "", standard_name: "", source_note: "",
  });
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiCandidates, setAiCandidates] = useState<QuantityAiCandidate[]>([]);
  const [aiProvider, setAiProvider] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [drawingBusy, setDrawingBusy] = useState(false);

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

  useEffect(() => {
    setAdminKey(loadPrefs().adminKey ?? "");
    void loadAll();
  }, [loadAll]);

  const loadTrees = useCallback(async () => {
    if (!baseId) return;
    const res = await api.workTypeTrees(baseId);
    setTrees(res.trees);
  }, [baseId]);

  const loadQuantities = useCallback(async () => {
    if (!projectId) return;
    const res = await api.quantities(projectId);
    setQuantities(res.quantities);
  }, [projectId]);

  useEffect(() => { void loadTrees(); }, [loadTrees]);
  useEffect(() => { void loadQuantities(); }, [loadQuantities]);

  const add = async () => {
    setNotice(null);
    try {
      await api.addQuantity({
        project_id: projectId,
        tree_id: form.tree_id,
        quantity: Number(form.quantity),
        unit: form.unit || undefined,
        condition_json: JSON.parse(form.condition_json || "{}"),
        item_name: form.item_name || undefined,
        standard_name: form.standard_name || undefined,
        source_note: form.source_note || undefined,
      });
      setNotice("数量を追加しました。");
      setForm({ ...form, tree_id: "", quantity: "", unit: "", condition_json: "{}", item_name: "", standard_name: "", source_note: "" });
      await loadQuantities();
    } catch (e) {
      setNotice(e instanceof Error ? `追加に失敗しました: ${e.message}` : "追加に失敗しました");
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteQuantity(id);
      await loadQuantities();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const doAiExtract = async () => {
    setNotice(null);
    if (!aiFile || !projectId || !baseId) return;
    setAiBusy(true);
    try {
      const res = await api.aiExtractQuantities(aiFile, projectId, baseId);
      setAiCandidates(res.result.candidates);
      setAiProvider(`${res.result.provider}${res.result.model ? ` / ${res.result.model}` : ""}`);
      setNotice(`AI数量候補を抽出しました（${res.result.candidates.length}件・生成元: ${aiProvider || res.result.provider}）。承認後に数量へ反映されます。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "抽出に失敗しました");
    } finally {
      setAiBusy(false);
    }
  };

  const approveCandidate = async (c: QuantityAiCandidate) => {
    if (!c.suggestion_id) return;
    try {
      await api.approveQuantitySuggestion(c.suggestion_id);
      setAiCandidates((prev) => prev.filter((x) => x.suggestion_id !== c.suggestion_id));
      await loadQuantities();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "承認に失敗しました");
    }
  };

  const rejectCandidate = async (c: QuantityAiCandidate) => {
    if (!c.suggestion_id) return;
    try {
      await api.rejectQuantitySuggestion(c.suggestion_id);
      setAiCandidates((prev) => prev.filter((x) => x.suggestion_id !== c.suggestion_id));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "却下に失敗しました");
    }
  };

  const doDrawingExtract = async () => {
    setNotice(null);
    if (!drawingFile || !projectId || !baseId) return;
    setDrawingBusy(true);
    try {
      const res = await api.drawingExtract(drawingFile, projectId, baseId);
      setAiCandidates((prev) => [...prev, ...res.result.candidates]);
      setNotice(`図面OCRで ${res.result.candidates.length}件の数量候補を抽出しました。承認後に数量へ反映されます。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "図面OCRに失敗しました（Vision対応プロバイダーが必要）");
    } finally {
      setDrawingBusy(false);
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">数量計算書</h1>
      <p className="text-sm text-gray-600">
        案件ごとに工種/細別の数量と施工条件を登録します。積算計算はこの数量を基に行われます。
      </p>
      {notice && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">{notice}</div>}
      {error && <ErrorMessage message={error} onRetry={() => void loadAll()} />}
      <div className="flex flex-wrap items-center gap-3">
        <select className="w-72 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="w-72 rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
          {bases.map((b) => <option key={b.id} value={b.id}>{b.base_code} {b.base_name}</option>)}
        </select>
        <input type="password" className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="X-Admin-Key" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
      </div>
      {loading && <LoadingState />}
      {!loading && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">数量一覧</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">工種/細別</th><th>数量</th><th>単位</th><th>条件</th><th>備考</th><th></th></tr></thead>
              <tbody>
                {quantities.map((q) => (
                  <tr key={q.id} className="border-b border-gray-100">
                    <td className="py-1">{q.tree_code} {q.tree_name}</td>
                    <td className="py-1 text-right">{formatNumber(q.quantity)}</td>
                    <td className="py-1">{q.unit ?? "—"}</td>
                    <td className="py-1 font-mono text-xs">{JSON.stringify(q.condition_json)}</td>
                    <td className="py-1 text-xs">{q.source_note ?? "—"}</td>
                    <td className="py-1"><button onClick={() => void remove(q.id)} className="text-xs text-red-600 hover:underline">削除</button></td>
                  </tr>
                ))}
                {quantities.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-gray-400">数量がありません</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">数量を追加</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <select className={inputCls} value={form.tree_id} onChange={(e) => setForm({ ...form, tree_id: e.target.value })}>
                <option value="">工種/細別*</option>
                {trees.map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}
              </select>
              <input className={inputCls} type="number" placeholder="数量*" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              <input className={inputCls} placeholder="単位（例: m3）" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              <input className={inputCls} placeholder={'条件 JSON（例: {"soil":"clay"}）'} value={form.condition_json} onChange={(e) => setForm({ ...form, condition_json: e.target.value })} />
              <input className={inputCls} placeholder="品目名（任意）" value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} />
              <input className={inputCls} placeholder="規格（任意）" value={form.standard_name} onChange={(e) => setForm({ ...form, standard_name: e.target.value })} />
              <input className={`${inputCls} md:col-span-2`} placeholder="出典・備考" value={form.source_note} onChange={(e) => setForm({ ...form, source_note: e.target.value })} />
            </div>
            <button onClick={() => void add()} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">数量を追加</button>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">AI数量取込（数量計算書Excel/CSV）</h2>
            <p className="mb-2 text-xs text-gray-500">
              工種体系へ「コード一致→名称一致→類似名称→AI対応付け」で候補を生成します。AIは候補と理由のみ提示し、金額は確定しません。
            </p>
            <div className="flex items-center gap-3">
              <input type="file" accept=".csv,.xlsx" className="text-sm" onChange={(e) => setAiFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => void doAiExtract()} disabled={aiBusy || !aiFile || !projectId || !baseId} className="rounded-md bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700 disabled:opacity-50">
                {aiBusy ? "抽出中…" : "AI候補を抽出"}
              </button>
              {aiProvider && <span className="text-xs text-gray-500">生成元: {aiProvider}</span>}
            </div>
            {aiCandidates.length > 0 && (
              <table className="mt-3 w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-gray-600"><th className="py-1">行</th><th>入力品目</th><th>対応工種</th><th>数量</th><th>条件</th><th>手法</th><th>理由</th><th></th></tr></thead>
                <tbody>
                  {aiCandidates.map((c) => (
                    <tr key={c.suggestion_id ?? c.row_number} className="border-b border-gray-100 align-top">
                      <td className="py-1">{c.row_number}</td>
                      <td className="py-1">{c.raw_item}</td>
                      <td className="py-1">{c.tree_code ? `${c.tree_code} ${c.tree_name}` : <span className="text-red-600">未対応</span>}</td>
                      <td className="py-1 text-right">{c.quantity ?? "—"} {c.unit ?? ""}</td>
                      <td className="py-1 font-mono text-xs">{JSON.stringify(c.condition_json)}</td>
                      <td className="py-1 text-xs">{c.match_method}</td>
                      <td className="py-1 text-xs text-gray-500">{c.reason}</td>
                      <td className="py-1 whitespace-nowrap text-xs">
                        <button onClick={() => void approveCandidate(c)} disabled={!c.suggestion_id} className="mr-2 rounded border border-green-300 px-2 py-1 text-green-700 hover:bg-green-50">承認</button>
                        <button onClick={() => void rejectCandidate(c)} disabled={!c.suggestion_id} className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50">却下</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 border-t border-gray-100 pt-3">
              <h3 className="mb-1 text-sm font-semibold">図面OCR（PNG/JPEG/WebP・Vision対応プロバイダー）</h3>
              <div className="flex items-center gap-3">
                <input type="file" accept=".png,.jpg,.jpeg,.webp" className="text-sm" onChange={(e) => setDrawingFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => void doDrawingExtract()} disabled={drawingBusy || !drawingFile} className="rounded bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-50">
                  {drawingBusy ? "読み取り中…" : "図面から抽出"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
