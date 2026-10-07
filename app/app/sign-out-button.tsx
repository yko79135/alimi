"use client";

import { useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { removeThisDevicePushSubscription } from "@/lib/push/client";
import { signOutAction } from "./actions";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // Best-effort: a failure here must never block signing out.
          await removeThisDevicePushSubscription(createClient()).catch(() => {});
          await signOutAction();
        })
      }
      className="hover:text-ink"
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
