"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SCHOOL_COOKIE } from "@/lib/tenant/active-school";

// Switching only changes which of the CALLER'S OWN memberships is
// preferred. It never grants access to a school the user doesn't belong
// to — every subsequent server action re-verifies membership itself.
export async function switchActiveSchool(schoolId: string) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const { data } = await supabase
    .from("school_memberships")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("school_id", schoolId)
    .eq("status", "active")
    .maybeSingle();

  if (!data) return; // silently ignore an id the user doesn't belong to

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SCHOOL_COOKIE, schoolId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/app");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
