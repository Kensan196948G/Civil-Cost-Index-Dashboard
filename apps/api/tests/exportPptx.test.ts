import { describe, expect, it } from "vitest";
import { buildPptx, zipStore } from "../src/services/exportPptx";

describe("zipStore", () => {
  it("writes a valid stored zip with visible content", () => {
    const zip = zipStore([
      { name: "hello.txt", data: new TextEncoder().encode("こんにちは") },
      { name: "dir/nested.txt", data: new TextEncoder().encode("nested") },
    ]);
    expect(zip[0]).toBe(0x50); // P
    expect(zip[1]).toBe(0x4b); // K
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("hello.txt");
    expect(text).toContain("こんにちは");
  });
});

describe("buildPptx", () => {
  it("builds a pptx package with slides", () => {
    const pptx = buildPptx({
      title: "建設コスト市況レポート",
      subtitle: "テスト",
      slides: [{ title: "異形棒鋼｜全国", subtitle: "2025-01〜2026-07", lines: ["2026-07 | 3.6 | +2.9% | +12.5% | 確報"] }],
      disclaimer: "参考情報",
    });
    expect(pptx[0]).toBe(0x50);
    expect(pptx[1]).toBe(0x4b);
    const text = new TextDecoder().decode(pptx);
    expect(text).toContain("建設コスト市況レポート");
    expect(text).toContain("slide1.xml");
    expect(text).toContain("異形棒鋼｜全国");
  });
});
