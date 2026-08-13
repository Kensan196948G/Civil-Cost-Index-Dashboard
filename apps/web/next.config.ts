import type { NextConfig } from "next";
const staticExport = process.env.NEXT_STATIC_EXPORT === "1";
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const nextConfig: NextConfig = {
  output: staticExport ? "export" : "standalone",
  trailingSlash: staticExport ? true : false,
  // ワークスペースルート誤検出（ホーム直下の package-lock.json を参照）を防ぎ、
  // ビルド時のトレース範囲をこのアプリに限定する
  outputFileTracingRoot: __dirname,
  images: { unoptimized: true },
  reactStrictMode: true,
  experimental: { cpus: 1 },
  webpack: (config) => {
    // wasm ベースのハッシュ関数がこの環境で確保に失敗するため JS 実装へ切替
    config.output.hashFunction = "md4";
    return config;
  },
  async rewrites() {
    // 同一オリジン /api をローカルAPIへプロキシ（NEXT_PUBLIC_API_BASE_URL 未設定時）
    const rewrites = [];
    if (!apiBase) {
      rewrites.push({
        source: "/api/:path*",
        destination: `${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000"}/api/:path*`,
      });
    }
    return rewrites;
  },
};

export default nextConfig;
