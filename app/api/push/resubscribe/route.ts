import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nowIso } from "@/lib/utils/dates";

const bodySchema = z.object({
  oldEndpoint: z.string().url().nullable(),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
});

// Called by public/sw.js on `pushsubscriptionchange`. Runs entirely on
// the caller's RLS-scoped client: push_subscriptions is owner-only, so
// the old endpoint can only be swapped out of a row the signed-in user
// already owns.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { oldEndpoint, subscription } = parsed.data;

  const fields = {
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_agent: request.headers.get("user-agent"),
    last_seen_at: nowIso(),
  };

  if (oldEndpoint) {
    const { data: updated } = await supabase
      .from("push_subscriptions")
      .update(fields)
      .eq("endpoint", oldEndpoint)
      .eq("user_id", user.id)
      .select("id");
    if (updated && updated.length > 0) return new Response(null, { status: 204 });
  }

  // No old row to carry over (browsers often omit oldSubscription). Any
  // of the user's schools works here — sending looks recipients up by
  // user_id, not school_id.
  const { data: membership } = await supabase
    .from("school_memberships")
    .select("school_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return new Response("No active school", { status: 409 });

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ ...fields, school_id: membership.school_id, user_id: user.id }, { onConflict: "endpoint" });
  if (error) return new Response("Could not save subscription", { status: 500 });
  return new Response(null, { status: 204 });
}
