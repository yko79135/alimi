"use client";

import { useState, useTransition } from "react";
import { saveAttendance } from "./actions";
import type { AttendanceStatus } from "@/types/database";

const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "early_leave", label: "Early leave" },
  { value: "excused", label: "Excused" },
];

export function AttendanceGrid({
  schoolId,
  date,
  students,
  existingStatus,
}: {
  schoolId: string;
  date: string;
  students: { id: string; name: string }[];
  existingStatus: Record<string, AttendanceStatus>;
}) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() => {
    const base: Record<string, AttendanceStatus> = {};
    for (const s of students) base[s.id] = existingStatus[s.id] ?? "present";
    return base;
  });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSave() {
    const changes = students
      .map((s) => {
        const previous = existingStatus[s.id] ?? "present";
        const next = statuses[s.id] ?? "present";
        if (previous === next) return null;
        return { studentId: s.id, previousStatus: previous, newStatus: next, reason: reasons[s.id] ?? "" };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (changes.length === 0) {
      setMessage("No changes to save.");
      return;
    }

    const missingReason = changes.find((c) => c.newStatus !== "present" && !c.reason.trim());
    if (missingReason) {
      setMessage("Add a reason for every non-present status.");
      return;
    }

    startTransition(async () => {
      const idempotencyKey = crypto.randomUUID();
      const result = await saveAttendance(schoolId, date, idempotencyKey, changes);
      setMessage(result.error ?? result.success);
    });
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-line rounded-lg border border-line bg-surface">
        {students.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 p-3">
            <span className="w-32 font-medium text-ink">{s.name}</span>
            <select
              value={statuses[s.id]}
              onChange={(e) => setStatuses((prev) => ({ ...prev, [s.id]: e.target.value as AttendanceStatus }))}
              className="rounded-md border border-line px-2 py-1 text-sm"
            >
              {STATUSES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
            {statuses[s.id] !== "present" ? (
              <input
                value={reasons[s.id] ?? ""}
                onChange={(e) => setReasons((prev) => ({ ...prev, [s.id]: e.target.value }))}
                placeholder="Reason (visible to guardian)"
                className="flex-1 min-w-[180px] rounded-md border border-line px-2 py-1 text-sm"
              />
            ) : null}
          </div>
        ))}
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <button
        type="button"
        disabled={pending}
        onClick={handleSave}
        className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save attendance"}
      </button>
    </div>
  );
}
