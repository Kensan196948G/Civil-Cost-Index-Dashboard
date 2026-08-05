"use client";

import { useState } from "react";
import { Card, CardTitle } from "./ui";

export default function ExportPanel({
  csvUrl, xlsxUrl, pdfUrl, pptxUrl, hasData,
}: { csvUrl: string | null; xlsxUrl: string | null; pdfUrl: string | null; pptxUrl: string | null; hasData: boolean }) {
  const [pdfMessage, setPdfMessage] = useState("");
  return (
    <Card>
      <CardTitle>出力</CardTitle>
      <div className="flex flex-wrap gap-3">
        <a
          href={csvUrl ?? "#"}
          download={csvUrl ? "cci-export.csv" : undefined}
          className={`rounded px-3 py-2 text-sm font-medium ${csvUrl && hasData ? "bg-blue-600 text-white hover:bg-blue-700" : "pointer-events-none bg-slate-200 text-slate-400"}`}
        >
          CSV出力
        </a>
        <a
          href={xlsxUrl ?? "#"}
          download={xlsxUrl ? "cci-export.xlsx" : undefined}
          className={`rounded px-3 py-2 text-sm font-medium ${xlsxUrl && hasData ? "bg-emerald-600 text-white hover:bg-emerald-700" : "pointer-events-none bg-slate-200 text-slate-400"}`}
        >
          Excel出力
        </a>
        <a
          href={pdfUrl ?? "#"}
          download={pdfUrl ? "cci-export.pdf" : undefined}
          className={`rounded px-3 py-2 text-sm font-medium ${pdfUrl && hasData ? "bg-rose-600 text-white hover:bg-rose-700" : "pointer-events-none bg-slate-200 text-slate-400"}`}
        >
          PDF出力
        </a>
        <a
          href={pptxUrl ?? "#"}
          download={pptxUrl ? "cci-export.pptx" : undefined}
          className={`rounded px-3 py-2 text-sm font-medium ${pptxUrl && hasData ? "bg-violet-600 text-white hover:bg-violet-700" : "pointer-events-none bg-slate-200 text-slate-400"}`}
        >
          PowerPoint出力
        </a>
      </div>
      {pdfMessage && <div className="mt-2 text-xs text-amber-600">{pdfMessage}</div>}
    </Card>
  );
}
