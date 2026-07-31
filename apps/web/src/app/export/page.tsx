"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { csvFileName, downloadCsv } from "@/lib/utils";

export default function ExportPage() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">レポート出力</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">CSV出力</h2>
        <p className="mb-3 text-sm text-gray-600">
          時系列分析・データテーブル画面のフィルター条件に応じたデータを CSV（UTF-8 BOM・日本語ヘッダー）で出力します。
        </p>
        <button
          onClick={() => {
            void downloadCsv(api.csvExportUrl({ data_type: "MATERIAL_PRICE", normalize: true }), csvFileName("cci-export"))
              .then(() => setMessage("CSVをダウンロードしました。"))
              .catch((e) => setMessage(e.message));
          }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          サンプル条件でCSV出力
        </button>
        {message && <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-800">{message}</div>}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">グラフ画像（PNG）出力</h2>
        <p className="text-sm text-gray-600">
          時系列分析・比較分析画面の「PNG出力」ボタンから、タイトル・条件・出典・作成日付きのグラフ画像を出力できます。
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">PDFレポート</h2>
        <p className="text-sm text-gray-500">PDFレポート出力は次期バージョンで対応予定です（準備中）。</p>
      </div>
    </div>
  );
}
