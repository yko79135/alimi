"use client";

import { useActionState, useState } from "react";
import { joinViaInvite, type JoinState } from "./actions";

interface GradeLevelOption {
  id: string;
  name: string;
}

interface ChildDraft {
  name: string;
  gradeLevelId: string;
  verificationCode: string;
  relationship: string;
}

const initialState: JoinState = { error: null };
const emptyChild: ChildDraft = { name: "", gradeLevelId: "", verificationCode: "", relationship: "" };

export function JoinForm({
  token,
  gradeLevels,
  restrictedGradeLevelId,
}: {
  token: string;
  gradeLevels: GradeLevelOption[];
  restrictedGradeLevelId: string | null;
}) {
  const [state, formAction, pending] = useActionState(joinViaInvite.bind(null, token), initialState);
  const [children, setChildren] = useState<ChildDraft[]>([
    { ...emptyChild, gradeLevelId: restrictedGradeLevelId ?? "" },
  ]);

  function updateChild(index: number, patch: Partial<ChildDraft>) {
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <input type="hidden" name="children" value={JSON.stringify(children)} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Your account</legend>
        <input
          name="fullName"
          placeholder="Your full name"
          required
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="Password (8+ characters)"
          minLength={8}
          required
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-ink">Children</legend>
        {children.map((child, i) => (
          <div key={i} className="space-y-2 rounded-md border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Child {i + 1}</span>
              {children.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setChildren((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <input
              value={child.name}
              onChange={(e) => updateChild(i, { name: e.target.value })}
              placeholder="Child's full name"
              required
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
            <select
              value={child.gradeLevelId}
              onChange={(e) => updateChild(i, { gradeLevelId: e.target.value })}
              required
              disabled={Boolean(restrictedGradeLevelId)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            >
              <option value="">Select grade</option>
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <input
              value={child.verificationCode}
              onChange={(e) => updateChild(i, { verificationCode: e.target.value.toUpperCase() })}
              placeholder="Verification code from your school"
              required
              className="w-full rounded-md border border-line px-3 py-2 text-sm uppercase tracking-widest"
            />
            <input
              value={child.relationship}
              onChange={(e) => updateChild(i, { relationship: e.target.value })}
              placeholder="Relationship (e.g. Mother, Father, Guardian)"
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
        ))}
        {children.length < 5 ? (
          <button
            type="button"
            onClick={() => setChildren((prev) => [...prev, { ...emptyChild, gradeLevelId: restrictedGradeLevelId ?? "" }])}
            className="text-sm font-medium text-brand hover:underline"
          >
            + Add another child
          </button>
        ) : null}
      </fieldset>

      {state.error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account & link children"}
      </button>
    </form>
  );
}
