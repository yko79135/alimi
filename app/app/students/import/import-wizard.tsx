"use client";

import { useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import type { GradeLevel } from "@/types/database";

interface ParsedRow {
  name: string;
  gradeText: string;
  gradeLevelId: string | null;
  studentNumber: string;
  enrollmentDate: string;
  warning?: string;
}

interface RowResult {
  index: number;
  name: string;
  status: "inserted" | "skipped_duplicate" | "invalid";
  reason?: string;
}

const ENCODINGS = [
  { value: "utf-8", label: "UTF-8 (default)" },
  { value: "euc-kr", label: "EUC-KR (Korean Excel export)" },
];

export function ImportWizard({ schoolId, gradeLevels }: { schoolId: string; gradeLevels: GradeLevel[] }) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [encoding, setEncoding] = useState("utf-8");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const gradeByName = new Map(gradeLevels.map((g) => [g.name.trim().toLowerCase(), g.id]));

  async function handleFile(file: File) {
    setError(null);
    setResults(null);
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder(encoding).decode(buffer);
    } catch {
      text = new TextDecoder("utf-8").decode(buffer);
    }

    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      setError("Could not read this file as CSV. Check the encoding and try again.");
      return;
    }

    const parsedRows: ParsedRow[] = parsed.data.map((raw) => {
      const name = (raw.name ?? "").trim();
      const gradeText = (raw.grade ?? "").trim();
      const gradeLevelId = gradeText ? gradeByName.get(gradeText.toLowerCase()) ?? null : null;
      const warning = gradeText && !gradeLevelId ? `Grade "${gradeText}" not found — will import without a grade` : undefined;
      return {
        name,
        gradeText,
        gradeLevelId,
        studentNumber: (raw.student_number ?? "").trim(),
        enrollmentDate: (raw.enrollment_date ?? "").trim(),
        warning,
      };
    });

    setRows(parsedRows);
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/students/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId,
          rows: rows.map((r) => ({
            name: r.name,
            gradeLevelId: r.gradeLevelId,
            studentNumber: r.studentNumber || null,
            enrollmentDate: r.enrollmentDate || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        return;
      }
      setResults(data.results as RowResult[]);
    } catch {
      setError("Import failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const invalidCount = rows.filter((r) => !r.name).length;
  const readyCount = rows.length - invalidCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/students/template"
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
        >
          Download CSV template
        </a>
        <select
          value={encoding}
          onChange={(e) => setEncoding(e.target.value)}
          className="rounded-md border border-line px-3 py-2 text-sm"
          aria-label="File encoding"
        >
          {ENCODINGS.map((enc) => (
            <option key={enc.value} value={enc.value}>
              {enc.label}
            </option>
          ))}
        </select>
        <label className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong cursor-pointer">
          Choose CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
        {fileName ? <span className="text-sm text-muted">{fileName}</span> : null}
      </div>

      {error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}

      {rows.length > 0 && !results ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {readyCount} row(s) ready to import{invalidCount > 0 ? `, ${invalidCount} missing a name and will be skipped` : ""}.
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Grade</th>
                  <th className="px-3 py-2 font-medium">Student #</th>
                  <th className="px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row, i) => (
                  <tr key={i} className={!row.name ? "bg-danger-soft" : undefined}>
                    <td className="px-3 py-2">{row.name || <span className="text-danger">Missing name</span>}</td>
                    <td className="px-3 py-2 text-muted">{row.gradeText || "—"}</td>
                    <td className="px-3 py-2 text-muted">{row.studentNumber || "—"}</td>
                    <td className="px-3 py-2 text-warning">{row.warning ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={submitting || readyCount === 0}
            onClick={handleConfirm}
            className="rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {submitting ? "Importing…" : `Import ${readyCount} student(s)`}
          </button>
        </div>
      ) : null}

      {results ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            {results.filter((r) => r.status === "inserted").length} imported,{" "}
            {results.filter((r) => r.status === "skipped_duplicate").length} skipped as duplicates,{" "}
            {results.filter((r) => r.status === "invalid").length} invalid.
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((r) => (
                  <tr key={r.index}>
                    <td className="px-3 py-2">{r.name || `Row ${r.index + 1}`}</td>
                    <td className="px-3 py-2">
                      {r.status === "inserted" ? (
                        <span className="text-success">Imported</span>
                      ) : r.status === "skipped_duplicate" ? (
                        <span className="text-warning">Skipped — {r.reason}</span>
                      ) : (
                        <span className="text-danger">Invalid — {r.reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/app/students" className="inline-block text-sm font-medium text-brand hover:underline">
            View students →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
