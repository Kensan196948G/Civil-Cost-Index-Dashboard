import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validateFetchUrl,
  sniffFormat,
  downloadUrl,
} from "../src/services/fetchUrl";

const errorStatus = (e: unknown): number => (e as Error & { status?: number }).status ?? 0;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validateFetchUrl (SSRF guard)", () => {
  it("rejects private / loopback / link-local IPv4", () => {
    for (const url of [
      "http://127.0.0.1/x",
      "http://10.0.0.1/x",
      "http://192.168.1.1/x",
      "http://172.16.0.1/x",
      "http://169.254.169.254/latest/meta-data",
      "http://0.0.0.0/x",
    ]) {
      expect(() => validateFetchUrl(url), url).toThrow(/許可されていません/);
    }
  });

  it("rejects loopback hostnames and IPv6 literals", () => {
    expect(() => validateFetchUrl("http://localhost/x")).toThrow(/許可されていません/);
    expect(() => validateFetchUrl("http://[::1]/x")).toThrow(/許可されていません/);
    expect(() => validateFetchUrl("http://[::ffff:127.0.0.1]/x")).toThrow(/許可されていません/);
    expect(() => validateFetchUrl("http://metadata.local/x")).toThrow(/許可されていません/);
  });

  it("rejects non-http schemes and embedded credentials", () => {
    expect(() => validateFetchUrl("ftp://example.com/x")).toThrow(/http\/https/);
    expect(() => validateFetchUrl("file:///etc/passwd")).toThrow(/http\/https/);
    expect(() => validateFetchUrl("http://user:pass@example.com/x")).toThrow(/資格情報/);
  });

  it("allows public hosts and honors FETCH_ALLOWED_HOSTS", () => {
    expect(validateFetchUrl("https://www.e-stat.go.jp/stat-search").protocol).toBe("https:");
    expect(() => validateFetchUrl("https://example.com/x", "e-stat.go.jp")).toThrow(/FETCH_ALLOWED_HOSTS/);
    expect(validateFetchUrl("https://www.e-stat.go.jp/x", "*.go.jp").hostname).toBe("www.e-stat.go.jp");
    expect(validateFetchUrl("https://www.mlit.go.jp/x", "e-stat.go.jp,*.mlit.go.jp").hostname).toBe("www.mlit.go.jp");
  });
});

describe("sniffFormat", () => {
  it("detects xlsx by ZIP magic", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer as ArrayBuffer;
    expect(sniffFormat(zip, "https://example.com/download", "application/octet-stream")).toBe("xlsx");
  });

  it("detects csv by path / content type / content", () => {
    const csv = new TextEncoder().encode("年月,品目,値\n2026-07,セメント,100\n").buffer as ArrayBuffer;
    expect(sniffFormat(csv, "https://example.com/data.csv", "application/octet-stream")).toBe("csv");
    expect(sniffFormat(csv, "https://example.com/download", "text/csv; charset=UTF-8")).toBe("csv");
    expect(sniffFormat(csv, "https://example.com/download", "application/octet-stream")).toBe("csv");
  });
});

describe("downloadUrl", () => {
  it("downloads CSV with redirects and re-validates the final URL", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "https://example.com/start") {
        return new Response(null, { status: 302, headers: { location: "https://data.example.com/file.csv" } });
      }
      return new Response("年月,品目,値\n2026-07,セメント,100\n", {
        status: 200,
        headers: { "content-type": "text/csv; charset=UTF-8" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await downloadUrl("https://example.com/start", { allowedHosts: "example.com,data.example.com" });
    expect(result.finalUrl).toBe("https://data.example.com/file.csv");
    expect(new TextDecoder().decode(result.buffer)).toContain("セメント");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects redirects to private addresses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, { status: 302, headers: { location: "http://10.0.0.1/steal" } })
      )
    );
    await expect(downloadUrl("https://example.com/start")).rejects.toThrow(/許可されていません/);
  });

  it("rejects oversized downloads before reading the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("x", {
          status: 200,
          headers: { "content-length": String(11 * 1024 * 1024) },
        })
      )
    );
    try {
      await downloadUrl("https://example.com/big.csv");
      expect.unreachable("should throw");
    } catch (e) {
      expect(errorStatus(e)).toBe(400);
      expect(String(e)).toContain("10MB");
    }
  });
});
