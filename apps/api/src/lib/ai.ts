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
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
export const DEFAULT_PERPLEXITY_MODEL = "sonar";
export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type AiProvider = "anthropic" | "deepseek" | "perplexity" | "workers-ai" | "none";

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

export type AiProviderDetail = {
  provider: AiProvider;
  label: string;
  configured: boolean;
  model: string | null;
};

export function getAiProviderInfo(env: Env): AiProviderInfo {
  const forced = (env.AI_PROVIDER || "").trim().toLowerCase();
  if (forced === "none") return { provider: "none", model: null };
  const validForced: AiProvider[] = ["anthropic", "deepseek", "perplexity", "workers-ai"];
  if (forced && validForced.includes(forced as AiProvider)) {
    if (forced === "anthropic" && env.ANTHROPIC_API_KEY) {
      return { provider: "anthropic", model: env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL };
    }
    if (forced === "deepseek" && env.DEEPSEEK_API_KEY) {
      return { provider: "deepseek", model: env.DEEPSEEK_MODEL || env.AI_MODEL || DEFAULT_DEEPSEEK_MODEL };
    }
    if (forced === "perplexity" && env.PERPLEXITY_API_KEY) {
      return { provider: "perplexity", model: env.PERPLEXITY_MODEL || env.AI_MODEL || DEFAULT_PERPLEXITY_MODEL };
    }
    if (forced === "workers-ai" && env.AI) {
      return { provider: "workers-ai", model: env.AI_MODEL || DEFAULT_WORKERS_AI_MODEL };
    }
    return { provider: "none", model: null };
  }
  if (!forced && env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", model: env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL };
  }
  if (!forced && env.DEEPSEEK_API_KEY) {
    return { provider: "deepseek", model: env.DEEPSEEK_MODEL || env.AI_MODEL || DEFAULT_DEEPSEEK_MODEL };
  }
  if (!forced && env.PERPLEXITY_API_KEY) {
    return { provider: "perplexity", model: env.PERPLEXITY_MODEL || env.AI_MODEL || DEFAULT_PERPLEXITY_MODEL };
  }
  if (!forced && env.AI) {
    return { provider: "workers-ai", model: env.AI_MODEL || DEFAULT_WORKERS_AI_MODEL };
  }
  return { provider: "none", model: null };
}

export function getAvailableProviders(env: Env): AiProviderDetail[] {
  return [
    {
      provider: "anthropic",
      label: "Anthropic",
      configured: !!env.ANTHROPIC_API_KEY,
      model: env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL,
    },
    {
      provider: "deepseek",
      label: "DeepSeek",
      configured: !!env.DEEPSEEK_API_KEY,
      model: env.DEEPSEEK_MODEL || env.AI_MODEL || DEFAULT_DEEPSEEK_MODEL,
    },
    {
      provider: "perplexity",
      label: "Perplexity",
      configured: !!env.PERPLEXITY_API_KEY,
      model: env.PERPLEXITY_MODEL || env.AI_MODEL || DEFAULT_PERPLEXITY_MODEL,
    },
    {
      provider: "workers-ai",
      label: "Workers AI",
      configured: !!env.AI,
      model: env.AI_MODEL || DEFAULT_WORKERS_AI_MODEL,
    },
  ];
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

  if (info.provider === "deepseek" || info.provider === "perplexity") {
    return callOpenAiCompatible(env, info.provider, info.model, opts);
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

async function callOpenAiCompatible(
  env: Env,
  provider: "deepseek" | "perplexity",
  model: string,
  opts: { system: string; prompt: string; maxTokens?: number }
): Promise<AiGenerateResult> {
  const apiKey = provider === "deepseek" ? env.DEEPSEEK_API_KEY : env.PERPLEXITY_API_KEY;
  const baseUrl = provider === "deepseek" ? "https://api.deepseek.com" : "https://api.perplexity.ai";
  const started = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      max_tokens: opts.maxTokens ?? 2048,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${provider === "deepseek" ? "DeepSeek" : "Perplexity"} APIエラー（HTTP ${res.status}）: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error(`${provider === "deepseek" ? "DeepSeek" : "Perplexity"} が空の応答を返しました。`);
  return {
    text,
    provider,
    model,
    durationMs: Date.now() - started,
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
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
