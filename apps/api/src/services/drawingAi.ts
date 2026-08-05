import Anthropic from "@anthropic-ai/sdk";
import type { Sql } from "../lib/db";
import type { Env } from "../types";
import type { Identity } from "../lib/auth";
import { getAiProviderInfo } from "../lib/ai";
import { listTrees } from "./estimating";
import { notifyAiApproval } from "./schedules";

function base64FromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function extractDrawingCandidates(
  sql: Sql,
  env: Env,
  input: {
    projectId: string;
    baseId: string;
    fileName: string;
    buffer: ArrayBuffer;
    identity: Identity;
  }
) {
  const info = getAiProviderInfo(env);
  if (info.provider !== "anthropic") {
    const err = new Error("図面OCRには Vision 対応プロバイダー（Anthropic）が必要です。AI_PROVIDER=anthropic を設定してください。");
    (err as Error & { status?: number }).status = 501;
    throw err;
  }
  const ext = input.fileName.toLowerCase().split(".").pop() ?? "";
  const mediaType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "jpeg" || ext === "jpg" ? "image/jpeg" : null;
  if (!mediaType) {
    const err = new Error("対応形式は PNG / JPEG / WebP です。");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const trees = await listTrees(sql, input.baseId);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: info.model!,
    max_tokens: 2048,
    system:
      "あなたは建設図面の数量拾い出し支援AIです。寸法・数量を読み取り、候補をJSON配列で返してください。金額は作成しません。",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64FromBuffer(input.buffer) },
          },
          {
            type: "text",
            text: `図面から数量候補を抽出してください。工種体系: ${JSON.stringify(
              trees.map((t) => ({ code: t.code, name: t.name, unit: t.unit }))
            )}\n出力形式: [{"tree_code":"...","quantity":0,"unit":"...","condition":{},"reason":"..."}]`,
          },
        ],
      },
    ],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const parsed = JSON.parse(text) as Array<{
    tree_code?: string;
    quantity?: number;
    unit?: string;
    condition?: Record<string, unknown>;
    reason?: string;
  }>;
  const treeByCode = new Map(trees.map((t) => [String(t.code).toLowerCase(), t]));
  const candidates = parsed
    .filter((c) => c.tree_code && treeByCode.has(c.tree_code.toLowerCase()) && Number.isFinite(c.quantity))
    .map((c) => {
      const tree = treeByCode.get(c.tree_code!.toLowerCase())!;
      return {
        row_number: 1,
        raw_item: `${tree.name}（図面OCR）`,
        tree_id: tree.id,
        tree_code: tree.code,
        tree_name: tree.name,
        quantity: c.quantity ?? null,
        unit: c.unit ?? tree.unit ?? null,
        condition_json: c.condition ?? {},
        match_method: "ai" as const,
        score: 0.8,
        reason: c.reason ?? "図面OCR抽出",
      };
    });
  const suggestionIds: string[] = [];
  for (const c of candidates) {
    const [row] = await sql`
      INSERT INTO ai_suggestions
        (suggestion_type, target_type, target_id, content, rationale, provider, model, created_by)
      VALUES
        ('quantity_extraction', 'project', ${input.projectId},
         ${JSON.stringify({
           row_number: 1,
           raw_item: c.raw_item,
           tree_id: c.tree_id,
           tree_code: c.tree_code,
           tree_name: c.tree_name,
           quantity: c.quantity,
           unit: c.unit,
           condition_json: c.condition_json,
           match_method: "ai",
           score: c.score,
         })},
         ${c.reason}, ${info.provider}, ${info.model}, ${input.identity.email})
      RETURNING id
    `;
    suggestionIds.push(String(row.id));
  }
  try {
    await notifyAiApproval(
      sql,
      env,
      `[CCI] 図面OCR候補 承認依頼（${candidates.length}件）`,
      `案件 ${input.projectId} に図面OCR数量候補${candidates.length}件が生成されました。承認待ちです。`
    );
  } catch (e) {
    console.warn("drawing_ai_notify_failed", e);
  }
  return { provider: info.provider, model: info.model, candidates: candidates.map((c, i) => ({ ...c, suggestion_id: suggestionIds[i] })), suggestion_ids: suggestionIds };
}
