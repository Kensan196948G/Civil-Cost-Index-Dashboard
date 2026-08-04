import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../types";

/**
 * AIプロバイダー抽象化。
 * 原則:
 *  - 集計・計算・アラート判定はコード側で行い、AIは「説明・要約」のみ担当する
 *  - モデル・プロバイダーは環境変数で差し替え可能にする
 *  - AI未設定でも全機能がルール生成テキストで動作する（provider: "none"）
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type AiProvider = "anthropic" | "workers-ai" | "none";

export type AiProviderInfo = {
  provider: AiProvider;
  model: string | null;
};

export type AiGenerateResult = {
  text: string;
  provider: AiProvider;
  model: string | null;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
};

export function getAiProviderInfo(env: Env): AiProviderInfo {
  const forced = (env.AI_PROVIDER || "").trim().toLowerCase();
  if (forced === "none") return { provider: "none", model: null };
  if (forced === "anthropic" || (!forced && env.ANTHROPIC_API_KEY)) {
    if (!env.ANTHROPIC_API_KEY) return { provider: "none", model: null };
    return { provider: "anthropic", model: env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL };
  }
  if (forced === "workers-ai" || (!forced && env.AI)) {
    if (!env.AI) return { provider: "none", model: null };
    return { provider: "workers-ai", model: env.AI_MODEL || DEFAULT_WORKERS_AI_MODEL };
  }
  return { provider: "none", model: null };
}

export async function generateAiText(
  env: Env,
  opts: { system: string; prompt: string; maxTokens?: number }
): Promise<AiGenerateResult | null> {
  const info = getAiProviderInfo(env);
  if (info.provider === "none" || !info.model) return null;
  const started = Date.now();

  if (info.provider === "anthropic") {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: info.model,
      max_tokens: opts.maxTokens ?? 2048,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    });
    if (response.stop_reason === "refusal") {
      throw new Error("AIモデルが応答を生成できませんでした（refusal）。");
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      text,
      provider: info.provider,
      model: info.model,
      durationMs: Date.now() - started,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    };
  }

  // Workers AI
  const raw = await env.AI!.run(info.model, {
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.prompt },
    ],
    max_tokens: opts.maxTokens ?? 2048,
  });
  const text = extractWorkersAiText(raw);
  return {
    text,
    provider: info.provider,
    model: info.model,
    durationMs: Date.now() - started,
    inputTokens: null,
    outputTokens: null,
  };
}

export function extractWorkersAiText(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.response === "string") return obj.response.trim();
    if (typeof obj.result === "string") return obj.result.trim();
  }
  return "";
}

/** 監査ログ保存前の簡易マスキング（メールアドレス・電話番号・キー様文字列） */
export function maskSensitive(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .replace(/\b0\d{1,4}-\d{1,4}-\d{3,4}\b/g, "[TEL]")
    .replace(/\b(sk|pk|key|token)[-_][A-Za-z0-9_-]{16,}\b/gi, "[SECRET]");
}
