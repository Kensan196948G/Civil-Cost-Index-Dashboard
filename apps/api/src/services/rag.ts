import { z } from "zod";
import type { Sql } from "../lib/db";
import type { Env } from "../types";
import type { Identity } from "../lib/auth";
import { generateAiText } from "../lib/ai";

const EMBED_DIM = 384;
const WORKERS_EMBED_MODEL = "@cf/baai/bge-small-en-v1.5";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DB driver boundary
type DbRow = Record<string, any>;

export type RagChunk = {
  id: string;
  source_type: string;
  source_id: string | null;
  title: string;
  content: string;
  similarity: number;
};

/** オフラインフォールバック埋め込み（文字トライグラム→正規化ベクトル）。Workers AI埋め込みが使える場合はそちらを優先。 */
export function fallbackEmbedding(text: string): number[] {
  const vec = new Float64Array(EMBED_DIM);
  const t = text.toLowerCase().replace(/[\s\u3000]+/g, " ");
  for (let i = 0; i <= t.length - 3; i++) {
    const h = hash(`${t.slice(i, i + 3)}|${i % 4}`);
    vec[h % EMBED_DIM] += 1;
  }
  if (t.length < 3) vec[0] = 1;
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return Array.from(vec, (v) => v / norm);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function embedText(env: Env, text: string): Promise<number[]> {
  if (env.AI) {
    try {
      const raw = (await env.AI.run(WORKERS_EMBED_MODEL, { text: [text.slice(0, 4000)] })) as {
        data?: Array<{ embedding?: number[] }>;
        embedding?: number[];
        shape?: number[];
      };
      const emb = raw.data?.[0]?.embedding ?? raw.embedding;
      if (Array.isArray(emb) && emb.length > 0) return emb;
    } catch (e) {
      console.warn("workers_ai_embedding_fallback", e);
    }
  }
  return fallbackEmbedding(text);
}

function vecString(v: number[]): string {
  return `[${v.map((n) => n.toFixed(6)).join(",")}]`;
}

export async function reindexAll(sql: Sql, env: Env, _identity: Identity) {
  await sql`DELETE FROM document_chunks`;
  const chunks: Array<{ source_type: string; source_id: string; title: string; content: string }> = [];

  const bases = await sql`SELECT id, base_code, base_name, category, fiscal_year, applicable_from, rounding_rules, source_note FROM estimation_bases`;
  for (const b of bases) {
    chunks.push({
      source_type: "estimation_base",
      source_id: String(b.id),
      title: `${b.base_code} ${b.base_name}`,
      content: `積算基準 ${b.base_code} ${b.base_name}（${b.fiscal_year}年度・適用${b.applicable_from}・区分${b.category}）。端数処理: ${JSON.stringify(b.rounding_rules)}。備考: ${b.source_note ?? ""}`,
    });
  }

  const breakdowns = await sql`
    SELECT wb.id, wb.tree_id, t.code, t.name, wb.condition_json, wb.labor_json, wb.material_json, wb.machinery_json
    FROM work_breakdowns wb JOIN work_type_trees t ON t.id = wb.tree_id
  `;
  for (const bd of breakdowns) {
    chunks.push({
      source_type: "work_breakdown",
      source_id: String(bd.id),
      title: `${bd.code} ${bd.name}`,
      content: `歩掛 ${bd.code} ${bd.name}。条件: ${JSON.stringify(bd.condition_json)}。労務: ${JSON.stringify(bd.labor_json)}。材料: ${JSON.stringify(bd.material_json)}。機械: ${JSON.stringify(bd.machinery_json)}`,
    });
  }

  const projects = await sql`
    SELECT p.id, p.name, p.client_name, p.work_type, p.status, r.region_name,
           coalesce(json_agg(json_build_object('item', i.item_name, 'qty', pi.quantity, 'price', pi.base_unit_price)) FILTER (WHERE pi.id IS NOT NULL), '[]') AS items
    FROM projects p
    LEFT JOIN regions r ON r.id = p.region_id
    LEFT JOIN project_items pi ON pi.project_id = p.id
    LEFT JOIN items i ON i.id = pi.item_id
    GROUP BY p.id, r.region_name
  `;
  for (const p of projects) {
    chunks.push({
      source_type: "project",
      source_id: String(p.id),
      title: p.name,
      content: `案件 ${p.name}（発注者: ${p.client_name ?? "—"}・工種: ${p.work_type ?? "—"}・地域: ${p.region_name ?? "—"}・状態: ${p.status}）。内訳: ${p.items}`,
    });
  }

  let inserted = 0;
  for (const c of chunks) {
    const emb = await embedText(env, c.content);
    await sql`
      INSERT INTO document_chunks (source_type, source_id, title, content, embedding)
      VALUES (${c.source_type}, ${c.source_id}, ${c.title}, ${c.content}, ${vecString(emb)}::vector)
    `;
    inserted++;
  }
  return { inserted, embedding: env.AI ? WORKERS_EMBED_MODEL : "fallback-hash" };
}

export async function searchChunks(
  sql: Sql,
  env: Env,
  query: string,
  opts: { limit?: number; source_types?: string[] } = {}
): Promise<RagChunk[]> {
  const emb = await embedText(env, query);
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20);
  const rows = (opts.source_types?.length
    ? await sql`
        SELECT id, source_type, source_id, title, content,
               1 - (embedding <=> ${vecString(emb)}::vector) AS similarity
        FROM document_chunks
        WHERE source_type = ANY(${opts.source_types})
        ORDER BY embedding <=> ${vecString(emb)}::vector
        LIMIT ${limit}
      `
    : await sql`
        SELECT id, source_type, source_id, title, content,
               1 - (embedding <=> ${vecString(emb)}::vector) AS similarity
        FROM document_chunks
        ORDER BY embedding <=> ${vecString(emb)}::vector
        LIMIT ${limit}
      `) as DbRow[];
  return rows.map((r) => ({
    id: String(r.id),
    source_type: String(r.source_type),
    source_id: r.source_id != null ? String(r.source_id) : null,
    title: String(r.title),
    content: String(r.content),
    similarity: Number(r.similarity),
  })) as RagChunk[];
}

export const ragAskSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(20).optional(),
  source_types: z.array(z.enum(["estimation_base", "work_breakdown", "project", "price_version"])).optional(),
});

export async function askRag(
  sql: Sql,
  env: Env,
  input: z.infer<typeof ragAskSchema> & { identity: Identity }
) {
  const { query, identity } = input;
  const chunks = await searchChunks(sql, env, query, { limit: input.limit ?? 8, source_types: input.source_types });
  if (chunks.length === 0) {
    return { provider: "none", model: null, answer: "該当する資料が見つかりませんでした。", sources: [], chunks: [] };
  }
  const sourceText = chunks
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.content}`)
    .join("\n\n");
  let provider = "rule";
  let model: string | null = null;
  let answer = "";
  try {
    const res = await generateAiText(env, {
      system:
        "あなたは建設コストの資料検索AIです。与えられた資料のみを根拠に、引用番号[1][2]...付きで回答してください。資料に無いことは「資料に記載がありません」と回答してください。",
      prompt: `質問: ${query}\n\n資料:\n${sourceText}`,
    }, "rag");
    if (res) {
      provider = res.provider;
      model = res.model;
      answer = res.text;
    }
  } catch {
    provider = "rule";
  }
  if (!answer) {
    answer = chunks.map((c, i) => `[${i + 1}] ${c.title}: ${c.content}`).join("\n");
  }
  await sql`
    INSERT INTO ai_suggestions
      (suggestion_type, target_type, target_id, content, rationale, provider, model, created_by)
    VALUES
      ('rag_answer', 'query', null, ${JSON.stringify({ query, answer, sources: chunks.map((c) => ({ title: c.title, similarity: c.similarity })) })},
       ${`RAG検索 ${chunks.length}件から回答`}, ${provider}, ${model}, ${identity.email})
  `;
  return {
    provider,
    model,
    answer,
    sources: chunks.map((c) => ({ title: c.title, source_type: c.source_type, source_id: c.source_id, similarity: c.similarity })),
    chunks: chunks.map((c) => ({ title: c.title, content: c.content })),
  };
}
