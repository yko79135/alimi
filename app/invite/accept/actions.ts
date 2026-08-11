"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AcceptInviteState {
  error: string | null;
}

export async function acceptInvite(
  schoolId: string,
  _prevState: AcceptInviteState,
  formData: FormData
): Promise<AcceptInviteState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/login");
  }

  const { error: pwError } = await supabase.auth.updateUser({ password });
  if (pwError) {
    return { error: pwError.message };
  }

  const { error: acceptError } = await supabase.rpc("accept_school_invite", { p_school_id: schoolId });
  if (acceptError) {
    return { error: "Could not join the school. Ask your admin to resend the invite." };
  }

  redirect("/app");
}
