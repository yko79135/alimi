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
    const { data } = await admin
      .from("school_memberships")
      .select("user_id")
      .eq("school_id", notice.school_id)
      .eq("role", "parent")
      .eq("status", "active");
    guardianIds = (data ?? []).map((r) => r.user_id);
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
      const { data: links } = await admin.from("guardian_students").select("guardian_id").in("student_id", studentIds);
      guardianIds = Array.from(new Set((links ?? []).map((r) => r.guardian_id)));
    }
  }

  if (guardianIds.length === 0) return { sent: 0, failed: 0 };

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", guardianIds);

  if (!subscriptions || subscriptions.length === 0) return { sent: 0, failed: 0 };

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
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }

  return { sent, failed };
}
