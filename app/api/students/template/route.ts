const TEMPLATE = "name,grade,student_number,enrollment_date\n" + "Jane Doe,Grade 1,,2026-03-02\n" + "김민준,1학년,10105,2026-03-02\n";

export function GET() {
  // UTF-8 BOM so the file opens correctly (no mojibake) when double-clicked
  // into Excel on Windows, which is the most common way schools will edit
  // this template before re-uploading it.
  const bom = "﻿";
  return new Response(bom + TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="alimi-student-import-template.csv"',
    },
  });
}
