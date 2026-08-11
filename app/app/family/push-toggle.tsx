"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { nowIso } from "@/lib/utils/dates";

function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

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
    navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setSubscribed(Boolean(existing));
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setError("Push notifications aren't configured for this school yet.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !json.endpoint || !json.keys) return;

      await supabase.from("push_subscriptions").upsert(
        {
          school_id: schoolId,
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent,
          last_seen_at: nowIso(),
        },
        { onConflict: "endpoint" }
      );
      setSubscribed(true);
    } catch {
      setError("Could not enable notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      if (existing) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", existing.endpoint);
        await existing.unsubscribe();
      }
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
