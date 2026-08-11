"use client";

import { useActionState } from "react";
import { acceptInvite, type AcceptInviteState } from "./actions";

const initialState: AcceptInviteState = { error: null };

export function AcceptInviteForm({ schoolId }: { schoolId: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite.bind(null, schoolId), initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <label className="block text-sm text-ink">
        Password
        <input
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
        />
      </label>
      {state.error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Joining…" : "Set password & join"}
      </button>
    </form>
  );
}
