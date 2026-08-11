"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null };

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/app";
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
          Alimi
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Log in</h1>
        <p className="mt-1 text-sm text-muted">Welcome back.</p>

        <form action={formAction} className="mt-8 space-y-4">
          <input type="hidden" name="next" value={next} />
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
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
            />
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
            {pending ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          New to Alimi?{" "}
          <Link href="/signup" className="font-medium text-brand hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
