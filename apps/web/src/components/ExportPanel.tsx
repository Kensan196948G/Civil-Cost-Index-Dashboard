"use client";

import { useState } from "react";
import { downloadFile } from "@/lib/utils";
import { Card, CardTitle } from "./ui";

export default function ExportPanel({
  csvUrl, xlsxUrl, pdfUrl, pptxUrl, hasData,
}: { csvUrl: string | null; xlsxUrl: string | null; pdfUrl: string | null; pptxUrl: string | null; hasData: boolean }) {
  const [pdfMessage, setPdfMessage] = useState("");
  const runDownload = async (url: string | null, filename: string, label: string) => {
    if (!url || !hasData) return;
    setPdfMessage("");
    try {
      await downloadFile(url, filename, label);
    } catch (e) {
      setPdfMessage(e instanceof Error ? e.message : `${label}出力に失敗しました`);
    }
  };
  return (
    <Card>
      <CardTitle>出力</CardTitle>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void runDownload(csvUrl, "cci-export.csv", "CSV")}
          disabled={!csvUrl || !hasData}
          className={`rounded px-3 py-2 text-sm font-medium ${csvUrl && hasData ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-slate-400"}`}
        >
          CSV出力
        </button>
        <button
          type="button"
          onClick={() => void runDownload(xlsxUrl, "cci-export.xlsx", "Excel")}
          disabled={!xlsxUrl || !hasData}
          className={`rounded px-3 py-2 text-sm font-medium ${xlsxUrl && hasData ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-200 text-slate-400"}`}
        >
          Excel出力
        </button>
        <button
          type="button"
          onClick={() => void runDownload(pdfUrl, "cci-export.pdf", "PDF")}
          disabled={!pdfUrl || !hasData}
          className={`rounded px-3 py-2 text-sm font-medium ${pdfUrl && hasData ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-slate-200 text-slate-400"}`}
        >
          PDF出力
        </button>
        <button
          type="button"
          onClick={() => void runDownload(pptxUrl, "cci-export.pptx", "PowerPoint")}
          disabled={!pptxUrl || !hasData}
          className={`rounded px-3 py-2 text-sm font-medium ${pptxUrl && hasData ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-slate-200 text-slate-400"}`}
        >
          PowerPoint出力
        </button>
      </div>
      {pdfMessage && <div className="mt-2 text-xs text-amber-600">{pdfMessage}</div>}
    </Card>
  );
}
