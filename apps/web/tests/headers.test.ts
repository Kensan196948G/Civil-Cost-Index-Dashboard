import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const headersPath = fileURLToPath(new URL("../public/_headers", import.meta.url));
const headers = readFileSync(headersPath, "utf8");
const cspLines = headers
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => /^Content-Security-Policy:/i.test(line));

const BEACON_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";

describe("deployed CSP (_headers)", () => {
  it("defines at least one CSP policy", () => {
    expect(cspLines.length).toBeGreaterThan(0);
  });

  it("allows the Cloudflare Web Analytics beacon script in every policy", () => {
    // Cloudflare が HTML へ自動注入する beacon.min.js は script-src で許可されていないと
    // ブラウザコンソールに CSP 違反として記録される（2026-10-18 staging で実測）。
    for (const line of cspLines) {
      expect(line).toContain(BEACON_SCRIPT_ORIGIN);
    }
  });

  it("keeps the app pages clickjacking-protected and unsafe-eval-free", () => {
    const appPolicy = cspLines.find((line) => !line.includes("/standalone.html"));
    expect(appPolicy).toBeDefined();
    // 最初のポリシーはルート（React アプリ）。standalone 用の緩和を混在させない。
    expect(cspLines[0]).toContain("frame-ancestors 'none'");
    expect(cspLines[0]).not.toContain("'unsafe-eval'");
  });

  it("keeps inline styles/scripts required by the static export", () => {
    for (const line of cspLines) {
      expect(line).toContain("script-src");
      expect(line).toContain("'unsafe-inline'");
      expect(line).toContain("style-src");
    }
  });
});
