"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolAdmin } from "@/lib/auth/require";
import { logAuditEvent } from "@/lib/audit/log";

export async function addGradeLevel(schoolId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  try {
    const { supabase, user } = await requireSchoolAdmin(schoolId);
    const { count } = await supabase
      .from("grade_levels")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId);

    const { data, error } = await supabase
      .from("grade_levels")
      .insert({ school_id: schoolId, name, sort_order: count ?? 0 })
      .select("id")
      .single();
    if (error) return;

    await logAuditEvent(supabase, {
      schoolId,
      actorId: user.id,
      action: "grade_level.create",
      targetType: "grade_level",
      targetId: data.id,
      metadata: { name },
    });
    revalidatePath("/app/settings");
  } catch (e) {
    console.error(e);
  }
}

export async function removeGradeLevel(schoolId: string, gradeLevelId: string) {
  try {
    const { supabase, user } = await requireSchoolAdmin(schoolId);
    await supabase.from("grade_levels").delete().eq("id", gradeLevelId).eq("school_id", schoolId);
    await logAuditEvent(supabase, {
      schoolId,
      actorId: user.id,
      action: "grade_level.delete",
      targetType: "grade_level",
      targetId: gradeLevelId,
    });
    revalidatePath("/app/settings");
  } catch (e) {
    console.error(e);
  }
}

export async function updateSchoolBranding(schoolId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const shortName = String(formData.get("short_name") ?? "").trim();
  const accentColor = String(formData.get("accent_color") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();

  if (!name) return;

  try {
    const { supabase, user } = await requireSchoolAdmin(schoolId);
    const { error } = await supabase
      .from("schools")
      .update({
        name,
        short_name: shortName || null,
        accent_color: accentColor || null,
        timezone: timezone || undefined,
        contact_email: contactEmail || null,
      })
      .eq("id", schoolId);
    if (error) return;

    await logAuditEvent(supabase, {
      schoolId,
      actorId: user.id,
      action: "school.update_branding",
      targetType: "school",
      targetId: schoolId,
    });
    revalidatePath("/app/settings");
  } catch (e) {
    console.error(e);
  }
}

export async function createParentSignupLink(schoolId: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const requiresApproval = formData.get("requires_approval") === "on";
  const gradeLevelId = String(formData.get("grade_level_id") ?? "").trim();

  try {
    const { supabase, user } = await requireSchoolAdmin(schoolId);
    const token = crypto.randomUUID().replace(/-/g, "");

    const { data, error } = await supabase
      .from("parent_signup_links")
      .insert({
        school_id: schoolId,
        token,
        label: label || "Parent signup",
        requires_approval: requiresApproval,
        grade_level_id: gradeLevelId || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) return;

    await logAuditEvent(supabase, {
      schoolId,
      actorId: user.id,
      action: "parent_signup_link.create",
      targetType: "parent_signup_link",
      targetId: data.id,
    });
    revalidatePath("/app/settings");
  } catch (e) {
    console.error(e);
  }
}

export async function deactivateParentSignupLink(schoolId: string, linkId: string) {
  try {
    const { supabase, user } = await requireSchoolAdmin(schoolId);
    await supabase.from("parent_signup_links").update({ active: false }).eq("id", linkId).eq("school_id", schoolId);
    await logAuditEvent(supabase, {
      schoolId,
      actorId: user.id,
      action: "parent_signup_link.deactivate",
      targetType: "parent_signup_link",
      targetId: linkId,
    });
    revalidatePath("/app/settings");
  } catch (e) {
    console.error(e);
  }
}
