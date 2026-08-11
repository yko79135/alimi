"use client";

import { useTransition } from "react";
import { signOutAction } from "./actions";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOutAction())}
      className="hover:text-ink"
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
