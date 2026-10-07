"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { nowIso } from "@/lib/utils/dates";

// Browser-side helpers for keeping THIS device's push subscription and its
// push_subscriptions row in step. The browser and the database can drift
// apart silently — the server deletes rows the push service reports as
// gone (404/410), the push service can rotate an endpoint, the VAPID key
// can change, or another account can own the row for a shared device —
// and any of those leaves the device looking "on" while nothing arrives.
// So the toggle re-syncs on every visit instead of trusting
// getSubscription() alone.

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function sameKey(subscription: PushSubscription, publicKey: Uint8Array) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === publicKey.length && bytes.every((b, i) => b === publicKey[i]);
}

async function saveSubscription(supabase: SupabaseClient<Database>, schoolId: string, userId: string, subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Push subscription is missing its endpoint or keys.");
  }
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      school_id: schoolId,
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
      last_seen_at: nowIso(),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
}

// Subscribes (or re-subscribes) this device and makes sure the server has
// a row for it owned by the signed-in user. With `createIfMissing` false
// this only repairs an existing browser subscription and never prompts
// for permission.
export async function syncPushSubscription(
  supabase: SupabaseClient<Database>,
  schoolId: string,
  { createIfMissing }: { createIfMissing: boolean }
): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Push notifications aren't configured for this school yet.");
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const registration = await navigator.serviceWorker.register("/sw.js");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && !createIfMissing) return false;

  // A subscription made under an older VAPID key can never be delivered
  // to again (the push service rejects every send), so replace it.
  if (subscription && !sameKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  }

  try {
    await saveSubscription(supabase, schoolId, user.id, subscription);
  } catch {
    // Most likely the endpoint's row belongs to another account that used
    // this browser before (RLS blocks updating it). A fresh subscription
    // gets a new endpoint this user can own; the old row then 410s and is
    // cleaned up by the sender.
    await subscription.unsubscribe();
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    await saveSubscription(supabase, schoolId, user.id, subscription);
  }
  return true;
}

// Called on sign-out so a shared device stops receiving the previous
// user's notifications and the next user can register it cleanly.
export async function removeThisDevicePushSubscription(supabase: SupabaseClient<Database>) {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const existing = await registration?.pushManager.getSubscription();
  if (!existing) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", existing.endpoint);
  await existing.unsubscribe();
}
