"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin, AuthError } from "@/lib/auth/require";

export async function suspendSchool(schoolId: string) {
  try {
    const { supabase } = await requirePlatformAdmin();
    await supabase.from("schools").update({ status: "suspended" }).eq("id", schoolId);
    await supabase.from("subscriptions").update({ status: "suspended" }).eq("school_id", schoolId);
    revalidatePath("/platform");
  } catch (e) {
    if (e instanceof AuthError) return;
    throw e;
  }
}

export async function reactivateSchool(schoolId: string) {
  try {
    const { supabase } = await requirePlatformAdmin();
    await supabase.from("schools").update({ status: "active" }).eq("id", schoolId);
    await supabase.from("subscriptions").update({ status: "active" }).eq("school_id", schoolId);
    revalidatePath("/platform");
  } catch (e) {
    if (e instanceof AuthError) return;
    throw e;
  }
}

export async function changeSchoolPlan(schoolId: string, formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "").trim() || null;
  try {
    const { supabase } = await requirePlatformAdmin();
    await supabase.from("subscriptions").update({ plan_id: planId }).eq("school_id", schoolId);
    revalidatePath("/platform");
  } catch (e) {
    if (e instanceof AuthError) return;
    throw e;
  }
}
