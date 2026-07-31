export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    current.push(field);
    field = "";
  };
  const pushLine = () => {
    if (current.some((cell) => cell.trim() !== "")) {
      lines.push(current);
    }
    current = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushField();
      pushLine();
    } else if (ch === "\r") {
      // skip CR (handled by LF)
    } else {
      field += ch;
    }
  }
  pushField();
  pushLine();

  if (lines.length === 0) return rows;
  const header = lines[0].map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const row: CsvRow = {};
    header.forEach((h, idx) => {
      row[h] = (line[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\r\n");
}
