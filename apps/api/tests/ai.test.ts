import { describe, expect, it, vi } from "vitest";
import { extractWorkersAiText, generateAiText, getAiProviderInfo, maskSensitive } from "../src/lib/ai";
import { buildSeriesFacts, computeStreak, monthsBetween, summarizeFacts } from "../src/services/aiFacts";
import { buildFallbackSummary, buildSummaryPrompt } from "../src/services/aiSummary";
import { buildFallbackExplanation } from "../src/services/aiAlerts";
import { buildReportSkeleton } from "../src/services/aiReport";
import {
  canonicalItemKey,
  checkSeriesQuality,
  computeQualityScore,
  findNameVariantCandidates,
  normalizeItemName,
} from "../src/services/aiQuality";
import type { Env } from "../src/types";

const baseEnv: Env = {
  DATABASE_URL: "",
  ADMIN_API_KEY: "",
  CORS_ORIGINS: "",
  APP_VERSION: "test",
};

function series(values: number[], startYear = 2024, startMonth = 1) {
  return values.map((v, i) => {
    const total = startYear * 12 + (startMonth - 1) + i;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    return { period: `${y}-${String(m).padStart(2, "0")}`, value: v };
  });
}

describe("getAiProviderInfo", () => {
  it("returns none when nothing configured", () => {
    expect(getAiProviderInfo(baseEnv)).toEqual({ provider: "none", model: null });
  });
  it("prefers anthropic when API key set", () => {
    const info = getAiProviderInfo({ ...baseEnv, ANTHROPIC_API_KEY: "sk-test" });
    expect(info.provider).toBe("anthropic");
    expect(info.model).toBe("claude-opus-5");
  });
  it("uses workers-ai when only binding present", () => {
    const info = getAiProviderInfo({ ...baseEnv, AI: { run: async () => ({}) } });
    expect(info.provider).toBe("workers-ai");
  });
  it("uses deepseek when only deepseek key set", () => {
    const info = getAiProviderInfo({ ...baseEnv, DEEPSEEK_API_KEY: "ds-key" });
    expect(info.provider).toBe("deepseek");
    expect(info.model).toBe("deepseek-chat");
  });
  it("uses perplexity when only perplexity key set", () => {
    const info = getAiProviderInfo({ ...baseEnv, PERPLEXITY_API_KEY: "pplx-key" });
    expect(info.provider).toBe("perplexity");
    expect(info.model).toBe("sonar");
  });
  it("prefers anthropic over deepseek", () => {
    const info = getAiProviderInfo({ ...baseEnv, ANTHROPIC_API_KEY: "sk-test", DEEPSEEK_API_KEY: "ds-key" });
    expect(info.provider).toBe("anthropic");
  });
  it("forced deepseek without key returns none", () => {
    const info = getAiProviderInfo({ ...baseEnv, AI_PROVIDER: "deepseek" });
    expect(info.provider).toBe("none");
  });
  it("respects AI_PROVIDER=none override", () => {
    const info = getAiProviderInfo({ ...baseEnv, ANTHROPIC_API_KEY: "sk-test", AI_PROVIDER: "none" });
    expect(info.provider).toBe("none");
  });
  it("respects AI_MODEL override", () => {
    const info = getAiProviderInfo({ ...baseEnv, ANTHROPIC_API_KEY: "sk-test", AI_MODEL: "claude-sonnet-5" });
    expect(info.model).toBe("claude-sonnet-5");
  });
  it("deepseek model override", () => {
    const info = getAiProviderInfo({ ...baseEnv, DEEPSEEK_API_KEY: "ds-key", DEEPSEEK_MODEL: "deepseek-reasoner" });
    expect(info.model).toBe("deepseek-reasoner");
  });
});

describe("generateAiText (OpenAI互換プロバイダー)", () => {
  it("calls DeepSeek chat completions endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: " 回答テキスト " } }],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await generateAiText(
        { ...baseEnv, DEEPSEEK_API_KEY: "ds-key", AI_PROVIDER: "deepseek" },
        { system: "system", prompt: "prompt" }
      );
      expect(res?.provider).toBe("deepseek");
      expect(res?.text).toBe("回答テキスト");
      expect(res?.inputTokens).toBe(12);
      expect(res?.outputTokens).toBe(7);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("api.deepseek.com/chat/completions");
      const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
      expect(body.model).toBe("deepseek-chat");
      expect(body.messages[0].content).toBe("system");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("calls Perplexity chat completions endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "回答" } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
          citations: ["https://example.com"],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await generateAiText(
        { ...baseEnv, PERPLEXITY_API_KEY: "pplx-key", AI_PROVIDER: "perplexity" },
        { system: "s", prompt: "p" }
      );
      expect(res?.provider).toBe("perplexity");
      expect(res?.text).toBe("回答");
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("api.perplexity.ai/chat/completions");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws on provider HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("bad key", { status: 401 })));
    try {
      await expect(
        generateAiText(
          { ...baseEnv, DEEPSEEK_API_KEY: "ds-key", AI_PROVIDER: "deepseek" },
          { system: "s", prompt: "p" }
        )
      ).rejects.toThrow(/DeepSeek APIエラー（HTTP 401）/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("extractWorkersAiText", () => {
  it("extracts response field", () => {
    expect(extractWorkersAiText({ response: " こんにちは " })).toBe("こんにちは");
  });
  it("handles plain string", () => {
    expect(extractWorkersAiText("text")).toBe("text");
  });
  it("returns empty string for unknown shapes", () => {
    expect(extractWorkersAiText({ foo: 1 })).toBe("");
  });
});

describe("maskSensitive", () => {
  it("masks emails and phone numbers", () => {
    const masked = maskSensitive("連絡先: taro@example.com / 03-1234-5678");
    expect(masked).not.toContain("taro@example.com");
    expect(masked).not.toContain("03-1234-5678");
  });
});

describe("computeStreak", () => {
  it("detects consecutive increases", () => {
    expect(computeStreak(series([100, 101, 102, 103, 104]))).toBe(4);
  });
  it("detects consecutive decreases as negative", () => {
    expect(computeStreak(series([104, 103, 102]))).toBe(-2);
  });
  it("returns 0 for flat tail", () => {
    expect(computeStreak(series([100, 101, 101]))).toBe(0);
  });
});

describe("monthsBetween", () => {
  it("computes month difference across years", () => {
    expect(monthsBetween("2025-11", "2026-02")).toBe(3);
  });
});

describe("buildSeriesFacts / summarizeFacts", () => {
  it("computes rates, streaks and warnings", () => {
    const rows = series([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 108, 109, 110], 2024, 1).map((p) => ({
      item_name: "H形鋼",
      region_name: "東京都",
      category: "MATERIAL_PRICE",
      unit: "円/t",
      source_name: "テスト統計",
      period: p.period,
      value: p.value,
    }));
    const facts = buildSeriesFacts(rows);
    expect(facts).toHaveLength(1);
    expect(facts[0].yoy_rate).toBeCloseTo(10, 1);
    expect(facts[0].streak).toBe(3);
    const summary = summarizeFacts(facts, "2025-03");
    expect(summary.top_yoy_up[0].item_name).toBe("H形鋼");
    expect(summary.streak_up).toHaveLength(1);
  });

  it("flags stale series", () => {
    const rows = series([100, 101], 2025, 1).map((p) => ({
      item_name: "生コン",
      region_name: "大阪府",
      category: "MATERIAL_PRICE",
      unit: "円/m3",
      source_name: null,
      period: p.period,
      value: p.value,
    }));
    const summary = summarizeFacts(buildSeriesFacts(rows), "2025-07");
    expect(summary.stale_series).toHaveLength(1);
    expect(summary.stale_series[0].months_behind).toBe(5);
  });
});

describe("buildFallbackSummary", () => {
  it("produces Japanese summary with sections", () => {
    const rows = series(Array.from({ length: 15 }, (_, i) => 100 + i), 2024, 1).map((p) => ({
      item_name: "H形鋼",
      region_name: "東京都",
      category: "MATERIAL_PRICE",
      unit: "円/t",
      source_name: "テスト統計",
      period: p.period,
      value: p.value,
    }));
    const facts = { ...summarizeFacts(buildSeriesFacts(rows), "2025-03"), sources: [] };
    const text = buildFallbackSummary(facts);
    expect(text).toContain("2025-03");
    expect(text).toContain("H形鋼");
    expect(text).toContain("上昇");
  });

  it("handles empty data", () => {
    const facts = { ...summarizeFacts([], null), sources: [] };
    expect(buildFallbackSummary(facts)).toContain("データがありません");
  });
});

describe("buildSummaryPrompt", () => {
  it("embeds facts and audience instruction", () => {
    const facts = { ...summarizeFacts([], "2026-07"), sources: [] };
    const { system, prompt } = buildSummaryPrompt(facts, "executive");
    expect(system).toContain("経営層");
    expect(system).toContain("推測しない");
    expect(prompt).toContain("2026-07");
  });
});

describe("buildFallbackExplanation", () => {
  it("mentions threshold and streak", () => {
    const text = buildFallbackExplanation({
      item_name: "H形鋼",
      region_name: "東京都",
      period: "2026-07",
      mom_rate: 2.1,
      yoy_rate: 12.3,
      reason: "前年比+12.3%",
      priority: "medium",
      streak: 4,
      threshold_mom: 5,
      threshold_yoy: 10,
    });
    expect(text).toContain("+12.3%");
    expect(text).toContain("閾値±10%");
    expect(text).toContain("4か月連続上昇");
  });
});

describe("buildReportSkeleton", () => {
  it("includes tables, sources and disclaimer", () => {
    const rows = series(Array.from({ length: 15 }, (_, i) => 100 + i), 2024, 1).map((p) => ({
      item_name: "H形鋼",
      region_name: "東京都",
      category: "MATERIAL_PRICE",
      unit: "円/t",
      source_name: "テスト統計",
      period: p.period,
      value: p.value,
    }));
    const facts = {
      ...summarizeFacts(buildSeriesFacts(rows), "2025-03"),
      sources: [{ source_name: "テスト統計", source_url: null, last_fetched_at: "2026-08-01T00:00:00+00" }],
    };
    const md = buildReportSkeleton(facts, "monthly", "所見テキスト", {
      generatedBy: "rule",
      provider: "none",
      model: null,
      generatedAt: "2026-08-04T00:00:00Z",
    });
    expect(md).toContain("# 月次市況レポート");
    expect(md).toContain("| 品目 |");
    expect(md).toContain("テスト統計");
    expect(md).toContain("参考情報");
  });
});

describe("quality checks", () => {
  it("normalizes item names", () => {
    expect(normalizeItemName("Ｈ形鋼 （大）")).toBe(normalizeItemName("H形鋼（大）"));
  });

  it("finds name variant candidates via synonyms", () => {
    const issues = findNameVariantCandidates([
      { item_name: "異形棒鋼 SD295A" },
      { item_name: "鉄筋 SD295A" },
      { item_name: "セメント" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("name_variant");
    expect(canonicalItemKey("異形棒鋼 SD295A")).toBe(canonicalItemKey("鉄筋 SD295A"));
  });

  it("detects stale series", () => {
    const issues = checkSeriesQuality(
      { item_name: "生コン", region_name: "大阪府", points: series([100, 101], 2025, 1) },
      "2025-08"
    );
    expect(issues.some((i) => i.type === "stale")).toBe(true);
  });

  it("detects gaps", () => {
    const points = [
      { period: "2025-01", value: 100 },
      { period: "2025-02", value: 101 },
      { period: "2025-05", value: 102 },
    ];
    const issues = checkSeriesQuality({ item_name: "A", region_name: "B", points }, "2025-05");
    expect(issues.some((i) => i.type === "gap")).toBe(true);
  });

  it("detects constant runs", () => {
    const issues = checkSeriesQuality(
      { item_name: "A", region_name: "B", points: series([100, 100, 100, 100, 100, 100, 100], 2025, 1) },
      "2025-07"
    );
    expect(issues.some((i) => i.type === "constant")).toBe(true);
  });

  it("detects outliers by z-score", () => {
    const values = [100, 100.5, 101, 100.7, 101.2, 100.9, 101.4, 101.1, 101.6, 150];
    const issues = checkSeriesQuality(
      { item_name: "A", region_name: "B", points: series(values, 2025, 1) },
      "2025-10"
    );
    expect(issues.some((i) => i.type === "outlier")).toBe(true);
  });

  it("computes quality score with deductions", () => {
    const score = computeQualityScore({
      source_name: "テスト統計",
      seriesCount: 10,
      staleCount: 2,
      gapCount: 1,
      outlierCount: 0,
      constantCount: 0,
    });
    expect(score.score).toBeLessThan(100);
    expect(score.score).toBeGreaterThan(50);
    expect(score.note).toContain("最新性");
  });
});
