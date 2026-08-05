import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Env } from "../types";
import type { Identity } from "../lib/auth";
import { generateAiText } from "../lib/ai";
import type { CsvRow } from "../lib/csv";
import { listTrees } from "./estimating";
import { notifyAiApproval } from "./schedules";

export type QuantityCandidate = {
  suggestion_id: string | null;
  row_number: number;
  raw_item: string;
  tree_id: string | null;
  tree_code: string | null;
  tree_name: string | null;
  quantity: number | null;
  unit: string | null;
  condition_json: Record<string, unknown>;
  match_method: "exact" | "fuzzy" | "ai" | "none";
  score: number;
  reason: string;
};

function normalizeName(s: string): string {
  return s
    .replace(/[\s\u3000（）()「」・]/g, "")
    .replace(/[0-9０-９\-－~～×xX]/g, "")
    .toLowerCase();
}

function matchTree(
  trees: Array<{ id: string; code: string; name: string; unit: string | null; level: number }>,
  row: CsvRow
): { tree: (typeof trees)[number] | null; method: "exact" | "fuzzy" | "none"; reason: string } {
  const rawName = String(row.item_name ?? row.品目 ?? row.細別 ?? "").trim();
  const rawCode = String(row.tree_code ?? row.工種コード ?? row.細別コード ?? "").trim();
  const norm = normalizeName(rawName);
  if (rawCode) {
    const exact = deepest(trees.filter((t) => t.code.toLowerCase() === rawCode.toLowerCase()));
    if (exact) return { tree: exact, method: "exact", reason: `コード一致: ${rawCode}` };
  }
  if (norm) {
    const exactName = deepest(trees.filter((t) => normalizeName(t.name) === norm));
    if (exactName) return { tree: exactName, method: "exact", reason: `名称一致: ${rawName}` };
    const fuzzy = deepest(trees.filter((t) => {
      const tn = normalizeName(t.name);
      return tn.length >= 2 && (norm.includes(tn) || tn.includes(norm));
    }));
    if (fuzzy) return { tree: fuzzy, method: "fuzzy", reason: `類似名称: ${rawName} → ${fuzzy.name}` };
  }
  return { tree: null, method: "none", reason: "マスタに一致なし（AI判定へ）" };
}

function deepest<T extends { level: number }>(list: T[]): T | null {
  return list.length === 0 ? null : list.reduce((a, b) => (b.level > a.level ? b : a));
}

export async function extractQuantityCandidates(
  sql: Sql,
  env: Env,
  input: {
    projectId: string;
    baseId: string;
    rows: CsvRow[];
    identity: Identity;
  }
) {
  const { projectId, baseId, rows, identity } = input;
  const project = await sql`SELECT id FROM projects WHERE id = ${projectId}`;
  if (project.length === 0) {
    const err = new Error("案件が見つかりません。");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const trees = await listTrees(sql, baseId);
  const candidates: QuantityCandidate[] = [];
  const unmatched: Array<{ index: number; raw_item: string }> = [];

  rows.forEach((row, i) => {
    const rawItem = String(row.item_name ?? row.品目 ?? row.細別 ?? "").trim();
    const quantityRaw = String(row.quantity ?? row.数量 ?? "");
    const quantity = Number(quantityRaw) || null;
    const matched = matchTree(trees as Array<{ id: string; code: string; name: string; unit: string | null; level: number }>, row);
    if (!matched.tree) {
      unmatched.push({ index: i, raw_item: rawItem });
      candidates.push({
        suggestion_id: null,
        row_number: i + 2,
        raw_item: rawItem,
        tree_id: null,
        tree_code: null,
        tree_name: null,
        quantity,
        unit: String(row.unit ?? row.単位 ?? "").trim() || null,
        condition_json: parseCondition(row),
        match_method: "none",
        score: 0,
        reason: matched.reason,
      });
      return;
    }
    candidates.push({
      suggestion_id: null,
      row_number: i + 2,
      raw_item: rawItem,
      tree_id: matched.tree.id,
      tree_code: matched.tree.code,
      tree_name: matched.tree.name,
      quantity,
      unit: String(row.unit ?? row.単位 ?? "").trim() || matched.tree.unit || null,
      condition_json: parseCondition(row),
      match_method: matched.method,
      score: matched.method === "exact" ? 0.95 : 0.7,
      reason: matched.reason,
    });
  });

  let provider = "rule";
  let model: string | null = null;
  if (unmatched.length > 0 && trees.length > 0) {
    try {
      const prompt = JSON.stringify({
        task: "数量計算書の品目名を工種体系へ対応付けてください。",
        unmatched: unmatched.map((u) => ({ index: u.index, raw_item: u.raw_item })),
        trees: trees.map((t) => ({ id: t.id, code: t.code, name: t.name })),
        output_format: '[{"index":0,"tree_code":"SOIL_EXCAVATION","reason":"..."}]',
      });
      const res = await generateAiText(env, {
        system: "あなたは建設積算の数量入力支援AIです。JSON配列のみ返してください。",
        prompt,
      }, "quantity");
      if (res) {
        provider = res.provider;
        model = res.model;
        const parsed = JSON.parse(res.text) as Array<{ index?: number; tree_code?: string; reason?: string }>;
        const treeByCode = new Map(trees.map((t) => [String(t.code).toLowerCase(), t]));
        for (const item of parsed) {
          if (typeof item.index !== "number" || !item.tree_code) continue;
          const tree = treeByCode.get(item.tree_code.toLowerCase());
          const candidate = candidates.find((c) => c.row_number === item.index! + 2);
          if (!candidate || !tree) continue;
          candidate.tree_id = tree.id;
          candidate.tree_code = tree.code;
          candidate.tree_name = tree.name;
          candidate.match_method = "ai";
          candidate.score = 0.8;
          candidate.reason = `AI対応付け: ${item.reason ?? ""}`;
        }
      }
    } catch (e) {
      console.warn("quantity_ai_extract_fallback", e);
    }
  }

  const suggestionIds: string[] = [];
  for (const c of candidates) {
    const [row] = await sql`
      INSERT INTO ai_suggestions
        (suggestion_type, target_type, target_id, content, rationale, provider, model, created_by)
      VALUES
        ('quantity_extraction', 'project', ${projectId},
         ${JSON.stringify({
           row_number: c.row_number,
           raw_item: c.raw_item,
           tree_id: c.tree_id,
           tree_code: c.tree_code,
           tree_name: c.tree_name,
           quantity: c.quantity,
           unit: c.unit,
           condition_json: c.condition_json,
           match_method: c.match_method,
           score: c.score,
         })},
         ${c.reason}, ${provider}, ${model}, ${identity.email})
      RETURNING id
    `;
    c.suggestion_id = String(row.id);
    suggestionIds.push(String(row.id));
  }
  try {
    await notifyAiApproval(
      sql,
      env,
      `[CCI] AI数量候補 承認依頼（${candidates.length}件）`,
      `案件 ${projectId} にAI数量候補${candidates.length}件が生成されました。承認待ちです。`
    );
  } catch (e) {
    console.warn("quantity_ai_notify_failed", e);
  }
  return { provider, model, candidates, suggestion_ids: suggestionIds };
}

function parseCondition(row: CsvRow): Record<string, unknown> {
  const raw = String(row.condition_json ?? row.施工条件 ?? "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { condition: raw };
  }
}

export async function listQuantitySuggestions(
  sql: Sql,
  filters: { projectId?: string; status?: string } = {}
) {
  const conds: string[] = ["suggestion_type = 'quantity_extraction'"];
  const params: unknown[] = [];
  if (filters.projectId) {
    params.push(filters.projectId);
    conds.push(`target_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conds.push(`status = $${params.length}`);
  }
  const rows = await sql(
    `
      SELECT id, target_id, content, rationale, provider, model, status,
             created_by, reviewed_by, reviewed_at,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
      FROM ai_suggestions
      WHERE ${conds.join(" AND ")}
      ORDER BY created_at DESC
    `,
    params
  );
  return rows;
}

export async function approveQuantitySuggestion(sql: Sql, id: string, identity: Identity) {
  const rows = await sql`
    SELECT * FROM ai_suggestions
    WHERE id = ${id} AND suggestion_type = 'quantity_extraction' AND status = 'pending'
  `;
  if (rows.length === 0) return null;
  const s = rows[0];
  const content = s.content as {
    tree_id: string | null;
    tree_code: string | null;
    tree_name: string | null;
    quantity: number | null;
    unit: string | null;
    condition_json: Record<string, unknown>;
    raw_item: string;
  };
  if (!content.tree_id || content.quantity == null) {
    const err = new Error("AI候補に工種または数量がありません。マスタを確認してください。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const [q] = await sql`
    INSERT INTO quantities
      (project_id, tree_id, item_name, unit, quantity, condition_json, source_note, created_by)
    VALUES
      (${String(s.target_id)}, ${content.tree_id}, ${content.tree_name ?? content.raw_item},
       ${content.unit ?? null}, ${content.quantity}, ${JSON.stringify(content.condition_json ?? {})},
       'AI数量取込（承認済み）', ${identity.email})
    RETURNING id
  `;
  await sql`
    UPDATE ai_suggestions SET status = 'approved', reviewed_by = ${identity.email}, reviewed_at = now()
    WHERE id = ${id}
  `;
  return { quantity_id: q.id, suggestion_id: id };
}

export async function rejectQuantitySuggestion(sql: Sql, id: string, identity: Identity) {
  const [row] = await sql`
    UPDATE ai_suggestions SET status = 'rejected', reviewed_by = ${identity.email}, reviewed_at = now()
    WHERE id = ${id} AND suggestion_type = 'quantity_extraction' AND status = 'pending'
    RETURNING id
  `;
  return row ?? null;
}

export const quantityAiParamsSchema = z.object({
  project_id: z.string().min(1),
  base_id: z.string().min(1),
});
