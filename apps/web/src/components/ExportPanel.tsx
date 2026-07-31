"use client";

import { useState } from "react";
import { Button, Card, CardTitle } from "./ui";

export default function ExportPanel({ csvUrl, hasData }: { csvUrl: string | null; hasData: boolean }) {
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
        <Button
          variant="secondary"
          disabled={!hasData}
          onClick={() => setPdfMessage("PDFレポート生成は現在未実装です（APIが501を返します）。")}
        >
          PDF出力（準備中）
        </Button>
      </div>
      {pdfMessage && <div className="mt-2 text-xs text-amber-600">{pdfMessage}</div>}
    </Card>
  );
}
