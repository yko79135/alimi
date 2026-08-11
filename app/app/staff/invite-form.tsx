"use client";

import { useActionState } from "react";
import { inviteStaff, type InviteStaffState } from "./actions";

const initialState: InviteStaffState = { error: null, success: null };

export function InviteStaffForm({ schoolId }: { schoolId: string }) {
  const [state, formAction, pending] = useActionState(inviteStaff.bind(null, schoolId), initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
      <label className="text-sm text-ink">
        Email
        <input
          name="email"
          type="email"
          required
          className="mt-1 block w-64 rounded-md border border-line px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm text-ink">
        Role
        <select name="role" defaultValue="teacher" className="mt-1 block rounded-md border border-line px-3 py-2 text-sm">
          <option value="teacher">Teacher</option>
          <option value="school_admin">School admin</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send invite"}
      </button>
      {state.error ? <p className="w-full text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="w-full text-sm text-success">{state.success}</p> : null}
    </form>
  );
}
