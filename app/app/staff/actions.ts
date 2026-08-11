"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolAdmin, AuthError } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";

export interface InviteStaffState {
  error: string | null;
  success: string | null;
}

export async function inviteStaff(
  schoolId: string,
  _prevState: InviteStaffState,
  formData: FormData
): Promise<InviteStaffState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "teacher");
  if (!email || !["school_admin", "teacher"].includes(role)) {
    return { error: "Enter a valid email and role.", success: null };
  }

  try {
    const { supabase, user: admin } = await requireSchoolAdmin(schoolId);

    const adminClient = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(`/invite/accept?school=${schoolId}`)}`;

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (inviteError || !invited.user) {
      // Most common cause: the user already has an Alimi account. Fall
      // back to looking them up and linking a new membership directly
      // instead of failing the whole invite.
      const { data: existing } = await adminClient.auth.admin.listUsers();
      const match = existing.users.find((u) => u.email?.toLowerCase() === email);
      if (!match) {
        return { error: inviteError?.message ?? "Could not send invite.", success: null };
      }
      await linkMembership(supabase, schoolId, match.id, role as "school_admin" | "teacher", admin.id, "active");
      await logAuditEvent(supabase, {
        schoolId,
        actorId: admin.id,
        action: "staff.invite_existing_user",
        targetType: "school_membership",
        metadata: { email, role },
      });
      revalidatePath("/app/staff");
      return { error: null, success: `${email} already had an account and was added directly.` };
    }

    await linkMembership(supabase, schoolId, invited.user.id, role as "school_admin" | "teacher", admin.id, "invited");
    await logAuditEvent(supabase, {
      schoolId,
      actorId: admin.id,
      action: "staff.invite",
      targetType: "school_membership",
      metadata: { email, role },
    });

    revalidatePath("/app/staff");
    return { error: null, success: `Invite sent to ${email}.` };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, success: null };
    console.error(e);
    return { error: "Something went wrong sending the invite.", success: null };
  }
}

async function linkMembership(
  supabase: Awaited<ReturnType<typeof requireSchoolAdmin>>["supabase"],
  schoolId: string,
  userId: string,
  role: "school_admin" | "teacher",
  invitedBy: string,
  status: "invited" | "active"
) {
  await supabase
    .from("school_memberships")
    .upsert(
      { school_id: schoolId, user_id: userId, role, status, invited_by: invitedBy },
      { onConflict: "school_id,user_id,role" }
    );
}

export async function deactivateStaffMembership(schoolId: string, membershipId: string) {
  const { supabase, user } = await requireSchoolAdmin(schoolId);
  await supabase
    .from("school_memberships")
    .update({ status: "deactivated" })
    .eq("id", membershipId)
    .eq("school_id", schoolId);
  await logAuditEvent(supabase, {
    schoolId,
    actorId: user.id,
    action: "staff.deactivate",
    targetType: "school_membership",
    targetId: membershipId,
  });
  revalidatePath("/app/staff");
}

export async function reactivateStaffMembership(schoolId: string, membershipId: string) {
  const { supabase, user } = await requireSchoolAdmin(schoolId);
  await supabase
    .from("school_memberships")
    .update({ status: "active" })
    .eq("id", membershipId)
    .eq("school_id", schoolId);
  await logAuditEvent(supabase, {
    schoolId,
    actorId: user.id,
    action: "staff.reactivate",
    targetType: "school_membership",
    targetId: membershipId,
  });
  revalidatePath("/app/staff");
}

export async function cancelPendingInvite(schoolId: string, membershipId: string) {
  const { supabase, user } = await requireSchoolAdmin(schoolId);
  await supabase
    .from("school_memberships")
    .delete()
    .eq("id", membershipId)
    .eq("school_id", schoolId)
    .eq("status", "invited");
  await logAuditEvent(supabase, {
    schoolId,
    actorId: user.id,
    action: "staff.cancel_invite",
    targetType: "school_membership",
    targetId: membershipId,
  });
  revalidatePath("/app/staff");
}
