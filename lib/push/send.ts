import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return false; // Push not configured for this deployment yet; no-op.
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

// PostgREST takes `.in()` filters in the URL query string, so a long id
// list (a school-wide notice to a few hundred families) overflows the
// URL limit and the request fails. Query in chunks instead.
const IN_CHUNK = 100;
const PAGE_SIZE = 1000;
function chunk<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += IN_CHUNK) out.push(items.slice(i, i + IN_CHUNK));
  return out;
}

interface NoticeForPush {
  id: string;
  school_id: string;
  target_scope: "school" | "grade" | "homeroom" | "student";
  target_grade_level_id: string | null;
  target_homeroom_id: string | null;
}

// Resolves recipients using the SAME targeting rules as
// guardian_can_see_notice() in the database, then sends a deliberately
// generic, non-identifying push payload (no student name or notice body
// — see public/sw.js) so a lock-screen notification can never leak
// sensitive information. Reads push_subscriptions for OTHER users, which
// their own RLS policy (owner-only) would never allow — this is one of
// the few legitimate service-role uses in the app, always called as a
// fire-and-forget background task AFTER the durable notice write has
// already committed, never blocking it.
export async function sendNoticePush(notice: NoticeForPush) {
  if (!ensureConfigured()) return { sent: 0, failed: 0 };
  const admin = createAdminClient();

  let guardianIds: string[] = [];
  if (notice.target_scope === "school") {
    // PostgREST returns at most 1000 rows per request (Supabase's default
    // max_rows), so page through or every parent past the first 1000
    // silently never gets a school-wide push.
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("school_memberships")
        .select("user_id")
        .eq("school_id", notice.school_id)
        .eq("role", "parent")
        .eq("status", "active")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) console.error("push: parent lookup failed", error);
      guardianIds.push(...(data ?? []).map((r) => r.user_id));
      if (!data || data.length < PAGE_SIZE) break;
    }
  } else if (notice.target_scope === "grade" && notice.target_grade_level_id) {
    const { data } = await admin
      .from("guardian_students")
      .select("guardian_id, student:students!inner(grade_level_id)")
      .eq("school_id", notice.school_id)
      .eq("student.grade_level_id", notice.target_grade_level_id);
    guardianIds = Array.from(new Set((data ?? []).map((r) => r.guardian_id)));
  } else if (notice.target_scope === "homeroom" && notice.target_homeroom_id) {
    const { data } = await admin
      .from("guardian_students")
      .select("guardian_id, student:students!inner(homeroom_id)")
      .eq("school_id", notice.school_id)
      .eq("student.homeroom_id", notice.target_homeroom_id);
    guardianIds = Array.from(new Set((data ?? []).map((r) => r.guardian_id)));
  } else if (notice.target_scope === "student") {
    const { data } = await admin.from("notice_students").select("student_id").eq("notice_id", notice.id);
    const studentIds = (data ?? []).map((r) => r.student_id);
    if (studentIds.length > 0) {
      const ids = new Set<string>();
      for (const part of chunk(studentIds)) {
        const { data: links, error } = await admin.from("guardian_students").select("guardian_id").in("student_id", part);
        if (error) console.error("push: guardian lookup failed", error);
        (links ?? []).forEach((r) => ids.add(r.guardian_id));
      }
      guardianIds = Array.from(ids);
    }
  }

  if (guardianIds.length === 0) return { sent: 0, failed: 0 };

  const subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  for (const part of chunk(guardianIds)) {
    const { data, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", part);
    if (error) console.error("push: subscription lookup failed", error);
    subscriptions.push(...(data ?? []));
  }

  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({
    title: "Alimi",
    body: "You have a new notice.",
    tag: "alimi-notice",
    url: "/app/family",
  });

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 24 }
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        } else {
          // Anything else (403 VAPID mismatch, 413, 429, 5xx) used to vanish
          // without a trace; log it so missing notifications are diagnosable.
          console.error("push: send failed", { subscriptionId: sub.id, statusCode, body: (err as { body?: string })?.body });
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }

  return { sent, failed };
}
