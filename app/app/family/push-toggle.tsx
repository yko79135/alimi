"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pushSupported, removeThisDevicePushSubscription, syncPushSubscription } from "@/lib/push/client";

export function PushToggle({ schoolId }: { schoolId: string }) {
  // Browser push support doesn't change during the component's lifetime,
  // so this is plain derived state rather than something to track with
  // useState/useEffect. It's `false` for the initial server-rendered
  // markup (no `window`) and resolves to the real value on the client
  // render right after hydration.
  const supported = pushSupported();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    // Re-sync on every visit: a browser subscription alone doesn't mean
    // the server can still reach this device (see lib/push/client.ts).
    syncPushSubscription(supabase, schoolId, { createIfMissing: false })
      .then((ok) => {
        if (!cancelled) setSubscribed(ok);
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase is a fresh-but-equivalent client each render
  }, [supported, schoolId]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        setError("Push notifications aren't configured for this school yet.");
        return;
      }
      setSubscribed(await syncPushSubscription(supabase, schoolId, { createIfMissing: true }));
    } catch {
      setError("Could not enable notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await removeThisDevicePushSubscription(supabase);
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted">Notifications on this device</span>
      <button
        type="button"
        disabled={busy}
        onClick={subscribed ? disable : enable}
        className="rounded-full border border-line px-3 py-1 font-medium hover:bg-canvas disabled:opacity-60"
      >
        {subscribed ? "Turn off" : "Turn on"}
      </button>
      {error ? <span className="text-danger">{error}</span> : null}
    </div>
  );
}
