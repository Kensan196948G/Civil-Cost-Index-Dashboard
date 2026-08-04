import { describe, expect, it } from "vitest";
import { buildPdfReport } from "../src/services/exportPdf";

describe("buildPdfReport", () => {
  it("builds a valid PDF with standard font (ASCII)", async () => {
    const pdf = await buildPdfReport({
      title: "Construction Cost Report",
      subtitle: "Test export",
      disclaimer: "Reference only.",
      sections: [
        {
          heading: "Rebar | National",
          rows: [
            ["2026-07", "3.6", "+2.9%", "+12.5%", "confirmed"],
            ["2026-08", "3.7", "+2.8%", "+12.0%", "confirmed"],
          ],
        },
      ],
    });
    const head = new TextDecoder().decode(pdf.slice(0, 8));
    expect(head.startsWith("%PDF-")).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
