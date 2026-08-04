"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { csvFileName, downloadFile } from "@/lib/utils";

export default function ExportPage() {
  const [message, setMessage] = useState<string | null>(null);
  const sampleParams = { data_type: "MATERIAL_PRICE" as const, normalize: true };
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">レポート出力</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">CSV / Excel / PDF / PowerPoint 出力</h2>
        <p className="mb-3 text-sm text-gray-600">
          時系列分析・データテーブル画面のフィルター条件に応じたデータを CSV（UTF-8 BOM・日本語ヘッダー）、
          Excel（概要／明細／出典の3シート・データ種別・積算利用可否付き）、PDF（日本語フォント埋め込み）、
          PowerPoint（概要＋系列別スライド）で出力します。
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              void downloadFile(api.csvExportUrl(sampleParams), csvFileName("cci-export"))
                .then(() => setMessage("CSVをダウンロードしました。"))
                .catch((e) => setMessage(e.message));
            }}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            サンプル条件でCSV出力
          </button>
          <button
            onClick={() => {
              void downloadFile(api.xlsxExportUrl(sampleParams), "cci-export.xlsx")
                .then(() => setMessage("Excelをダウンロードしました。"))
                .catch((e) => setMessage(e.message));
            }}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
          >
            サンプル条件でExcel出力
          </button>
          <button
            onClick={() => {
              void downloadFile(api.pdfExportUrl(sampleParams), "cci-export.pdf")
                .then(() => setMessage("PDFをダウンロードしました。"))
                .catch((e) => setMessage(e.message));
            }}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm text-white hover:bg-rose-700"
          >
            サンプル条件でPDF出力
          </button>
          <button
            onClick={() => {
              void downloadFile(api.pptxExportUrl(sampleParams), "cci-export.pptx")
                .then(() => setMessage("PowerPointをダウンロードしました。"))
                .catch((e) => setMessage(e.message));
            }}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700"
          >
            サンプル条件でPowerPoint出力
          </button>
        </div>
        {message && <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-800">{message}</div>}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">積算連携Excel（単価候補・根拠・改定差分）</h2>
        <p className="mb-3 text-sm text-gray-600">
          承認済みの単価版を「品目コード・出典・基準年月・適用期間・税込/税抜・運賃込み/別」付きで出力し、
          既存の積算システムやExcelテンプレートへ受け渡すためのファイルです。単価版管理画面からはスナップショット付きでも出力できます。
        </p>
        <button
          onClick={() => {
            void downloadFile(api.estimateLinkExportUrl(), "cci-estimate-link.xlsx")
              .then(() => setMessage("積算連携Excelをダウンロードしました。"))
              .catch((e) => setMessage(e.message));
          }}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-800"
        >
          単価候補・改定差分を出力
        </button>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">グラフ画像（PNG）出力</h2>
        <p className="text-sm text-gray-600">
          時系列分析・比較分析画面の「PNG出力」ボタンから、タイトル・条件・出典・作成日付きのグラフ画像を出力できます。
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold">補足</h2>
        <p className="text-sm text-gray-500">
          PDF出力は日本語フォントをサーバー側で取得・埋め込みます。フォント取得に失敗する場合は環境変数
          <code className="mx-1 rounded bg-gray-100 px-1">PDF_CJK_FONT_URL</code> でTTF/OTFのURLを指定してください。
        </p>
      </div>
    </div>
  );
}
