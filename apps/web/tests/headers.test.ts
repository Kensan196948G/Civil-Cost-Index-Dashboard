import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const headersPath = fileURLToPath(new URL("../public/_headers", import.meta.url));
const headers = readFileSync(headersPath, "utf8");

const BEACON_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";

type CspPolicy = {
  path: string;
  directives: Map<string, string[]>;
  raw: string;
};

/**
 * `_headers` を「パス + CSP」の組として解析する。
 * 行単位の contains では、許可元を別ディレクティブへ移しても検出できないため、
 * ディレクティブ単位で検査する。
 */
function parseCspPolicies(source: string): CspPolicy[] {
  const policies: CspPolicy[] = [];
  let currentPath: string | undefined;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    const pathMatch = /^(\/\S*)$/.exec(trimmed);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const policyMatch = /^Content-Security-Policy:\s*(.+)$/i.exec(trimmed);
    if (!policyMatch || !currentPath) continue;
    const raw = policyMatch[1].trim();
    const directives = new Map<string, string[]>();
    for (const part of raw.split(";")) {
      const tokens = part.trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) continue;
      directives.set(tokens[0].toLowerCase(), tokens.slice(1));
    }
    policies.push({ path: currentPath, directives, raw });
  }
  return policies;
}

const policies = parseCspPolicies(headers);
const appPolicies = policies.filter((p) => p.path !== "/standalone.html");

describe("deployed CSP (_headers)", () => {
  it("parses a policy for every path section", () => {
    expect(policies.length).toBeGreaterThan(0);
    expect(policies.map((p) => p.path)).toEqual(
      expect.arrayContaining(["/", "/admin*", "/standalone.html"])
    );
    // 解析漏れ（CSP行の書式崩れ）を検知する。
    const cspLineCount = headers
      .split(/\r?\n/)
      .filter((line) => /^\s*Content-Security-Policy:/i.test(line)).length;
    expect(policies.length).toBe(cspLineCount);
  });

  it("allows the Cloudflare Web Analytics beacon in script-src (not elsewhere)", () => {
    // Cloudflare が HTML へ自動注入する beacon.min.js は script-src で許可されていないと
    // ブラウザコンソールに CSP 違反として記録される（2026-10-18 staging で実測）。
    for (const { path, directives } of policies) {
      expect(directives.get("script-src"), `${path} script-src`).toContain(BEACON_SCRIPT_ORIGIN);
    }
  });

  it("keeps inline scripts/styles required by the static export", () => {
    for (const { path, directives } of policies) {
      expect(directives.get("script-src"), `${path} script-src`).toContain("'unsafe-inline'");
      expect(directives.get("style-src"), `${path} style-src`).toContain("'unsafe-inline'");
    }
  });

  it("keeps app pages clickjacking-protected and unsafe-eval-free", () => {
    expect(appPolicies.length).toBeGreaterThan(0);
    for (const { path, directives } of appPolicies) {
      expect(directives.get("frame-ancestors"), `${path} frame-ancestors`).toEqual(["'none'"]);
      expect(directives.get("script-src") ?? [], `${path} script-src`).not.toContain("'unsafe-eval'");
    }
  });

  it("does not broaden script-src beyond the explicit allowlist", () => {
    for (const { path, directives } of policies) {
      const scriptSrc = directives.get("script-src") ?? [];
      expect(scriptSrc, `${path} script-src`).not.toContain("*");
      expect(scriptSrc, `${path} script-src`).not.toContain("https:");
      expect(directives.get("default-src"), `${path} default-src`).toEqual(["'self'"]);
    }
  });

  it("keeps the standalone bundle relaxation scoped to /standalone.html", () => {
    const standalone = policies.find((p) => p.path === "/standalone.html");
    expect(standalone?.directives.get("frame-ancestors")).toEqual(["'self'"]);
    expect(standalone?.directives.get("script-src")).toContain("'unsafe-eval'");
    for (const { path, directives } of appPolicies) {
      expect(directives.get("script-src"), `${path} must not inherit standalone relaxation`).not.toContain(
        "'unsafe-eval'"
      );
    }
  });
});
