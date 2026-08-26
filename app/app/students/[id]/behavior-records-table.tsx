"use client";

import { useActionState, useEffect, useState } from "react";
import { updateBehaviorRecord } from "@/app/app/behavior/actions";
import type { BehaviorFormState } from "@/app/app/behavior/actions";
import type { BehaviorCategory } from "@/types/database";

interface BehaviorRow {
  id: string;
  category_id: string | null;
  kind: "discipline" | "praise";
  points: number;
  occurred_on: string;
  reason: string;
  guardian_message: string | null;
  teacher_note: string | null;
  edited_at: string | null;
}

const initialState: BehaviorFormState = { error: null, success: null };

export function BehaviorRecordsTable({
  schoolId,
  records,
  categories,
}: {
  schoolId: string;
  records: BehaviorRow[];
  categories: BehaviorCategory[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (records.length === 0) {
    return <p className="mt-2 text-sm text-muted">No behavior records yet.</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="border-b border-line text-left text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Points</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {records.map((r) =>
            editingId === r.id ? (
              <tr key={r.id}>
                <td colSpan={5} className="bg-canvas p-3">
                  <BehaviorEditForm
                    schoolId={schoolId}
                    record={r}
                    categories={categories}
                    onDone={() => setEditingId(null)}
                  />
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td className="px-3 py-2 text-muted">{r.occurred_on}</td>
                <td className={r.kind === "praise" ? "px-3 py-2 text-success" : "px-3 py-2 text-danger"}>
                  {r.kind === "praise" ? "Praise" : "Discipline"}
                </td>
                <td className="px-3 py-2 text-ink">
                  {r.kind === "praise" ? "+" : "-"}
                  {r.points}
                </td>
                <td className="px-3 py-2 text-ink">
                  {r.reason}
                  {r.edited_at ? <span className="ml-2 text-xs text-muted">(edited)</span> : null}
                </td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => setEditingId(r.id)} className="text-sm text-brand hover:underline">
                    Edit
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function BehaviorEditForm({
  schoolId,
  record,
  categories,
  onDone,
}: {
  schoolId: string;
  record: BehaviorRow;
  categories: BehaviorCategory[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateBehaviorRecord.bind(null, schoolId, record.id),
    initialState
  );
  const [kind, setKind] = useState<"discipline" | "praise">(record.kind);

  // Collapse back to the read-only row once the save has landed.
  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-2">
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={() => setKind("discipline")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${kind === "discipline" ? "bg-danger-soft text-danger" : "border border-line text-muted"}`}
        >
          Discipline
        </button>
        <button
          type="button"
          onClick={() => setKind("praise")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${kind === "praise" ? "bg-brand-soft text-brand-strong" : "border border-line text-muted"}`}
        >
          Praise
        </button>
      </div>
      <input type="hidden" name="kind" value={kind} />

      <select
        name="category_id"
        defaultValue={record.category_id ?? ""}
        className="rounded-md border border-line px-2 py-1 text-sm"
      >
        <option value="">No category</option>
        {categories
          .filter((c) => c.kind === kind)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
      </select>

      <input
        type="number"
        name="points"
        min={1}
        max={20}
        defaultValue={record.points}
        className="w-20 rounded-md border border-line px-2 py-1 text-sm"
      />

      <input
        type="date"
        name="occurred_on"
        defaultValue={record.occurred_on}
        className="rounded-md border border-line px-2 py-1 text-sm"
      />

      <input
        name="reason"
        defaultValue={record.reason}
        required
        placeholder="Reason"
        className="rounded-md border border-line px-2 py-1 text-sm sm:col-span-2"
      />

      <input
        name="guardian_message"
        defaultValue={record.guardian_message ?? ""}
        placeholder="Message to guardian (optional)"
        className="rounded-md border border-line px-2 py-1 text-sm sm:col-span-2"
      />

      <input
        name="teacher_note"
        defaultValue={record.teacher_note ?? ""}
        placeholder="Private note (staff only, optional)"
        className="rounded-md border border-line px-2 py-1 text-sm sm:col-span-2"
      />

      {state.error ? <p className="text-sm text-danger sm:col-span-2">{state.error}</p> : null}

      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface">
          Cancel
        </button>
      </div>
    </form>
  );
}
