// Minimal, dependency-free CSV writer (no external library needed for
// output — Papa is only used client-side for parsing imports). Quotes
// every field and escapes embedded quotes, which is enough to round-trip
// correctly in Excel including Korean text (emitted with a UTF-8 BOM by
// each export route so Excel doesn't mis-detect the encoding).
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (value: string | number | null) => {
    const s = value === null || value === undefined ? "" : String(value);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];
  return lines.join("\r\n");
}

export function csvResponse(fileName: string, csv: string) {
  const bom = "﻿";
  return new Response(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
