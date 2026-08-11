"use client";

import { useActionState, useMemo, useState } from "react";
import { createBehaviorRecord, type BehaviorFormState } from "./actions";
import { todayIso } from "@/lib/utils/dates";
import type { BehaviorCategory } from "@/types/database";

const initialState: BehaviorFormState = { error: null, success: null };

export function BehaviorForm({
  schoolId,
  students,
  categories,
}: {
  schoolId: string;
  students: { id: string; name: string }[];
  categories: BehaviorCategory[];
}) {
  const [state, formAction, pending] = useActionState(createBehaviorRecord.bind(null, schoolId), initialState);
  const [kind, setKind] = useState<"discipline" | "praise">("discipline");
  const filtered = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);
  const [categoryId, setCategoryId] = useState("");

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setKind("discipline")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${kind === "discipline" ? "bg-danger-soft text-danger" : "border border-line text-muted"}`}
        >
          Discipline
        </button>
        <button
          type="button"
          onClick={() => setKind("praise")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${kind === "praise" ? "bg-brand-soft text-brand-strong" : "border border-line text-muted"}`}
        >
          Praise
        </button>
      </div>
      <input type="hidden" name="kind" value={kind} />

      <select name="student_id" required className="w-full rounded-md border border-line px-3 py-2 text-sm">
        <option value="">Select student</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        name="category_id"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="w-full rounded-md border border-line px-3 py-2 text-sm"
      >
        <option value="">No category</option>
        {filtered.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <label className="text-sm text-ink">Points</label>
        <input
          type="number"
          name="points"
          min={1}
          max={20}
          defaultValue={selectedCategory?.default_points ?? 1}
          key={selectedCategory?.id ?? "none"}
          className="w-20 rounded-md border border-line px-2 py-1 text-sm"
        />
      </div>

      <input name="reason" required placeholder="Reason" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
      <input
        name="guardian_message"
        placeholder="Message to guardian (optional, visible to parent)"
        className="w-full rounded-md border border-line px-3 py-2 text-sm"
      />
      <input
        name="teacher_note"
        placeholder="Private note (staff only, optional)"
        className="w-full rounded-md border border-line px-3 py-2 text-sm"
      />
      <input type="date" name="occurred_on" defaultValue={todayIso()} className="rounded-md border border-line px-3 py-2 text-sm" />

      {state.error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">{state.success}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save record"}
      </button>
    </form>
  );
}
