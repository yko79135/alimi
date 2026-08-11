"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignupState } from "./actions";

const initialState: SignupState = { error: null, checkEmail: false };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
          Alimi
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          Next you&apos;ll create your school, or wait for an invite if your school already uses Alimi.
        </p>

        {state.checkEmail ? (
          <div className="mt-8 rounded-md border border-line bg-surface p-4 text-sm text-ink">
            Check <strong>your email</strong> for a confirmation link, then log in to continue.
            <div className="mt-3">
              <Link href="/login" className="font-medium text-brand hover:underline">
                Go to login
              </Link>
            </div>
          </div>
        ) : (
          <form action={formAction} className="mt-8 space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-ink">
                Full name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
              />
              <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
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
              {pending ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
