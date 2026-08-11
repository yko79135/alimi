"use client";

import { useActionState } from "react";
import { createSchool, type CreateSchoolState } from "./actions";

const TIMEZONES = ["Asia/Seoul", "America/New_York", "America/Los_Angeles", "Europe/London", "UTC"];
const LOCALES = [
  { value: "ko", label: "한국어 (Korean)" },
  { value: "en", label: "English" },
];

const initialState: CreateSchoolState = { error: null };

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createSchool, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-ink">
          School name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Seoul Example School"
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
        />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-ink">
          URL slug
        </label>
        <input
          id="slug"
          name="slug"
          type="text"
          placeholder="seoul-example-school"
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
        />
        <p className="mt-1 text-xs text-muted">Lowercase letters, numbers, hyphens. Leave blank to auto-generate.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-ink">
            Timezone
          </label>
          <select
            id="timezone"
            name="timezone"
            defaultValue="Asia/Seoul"
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="locale" className="block text-sm font-medium text-ink">
            Language
          </label>
          <select
            id="locale"
            name="locale"
            defaultValue="ko"
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create school"}
      </button>
    </form>
  );
}
