"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SignupState {
  error: string | null;
  checkEmail: boolean;
}

export async function signUp(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !email || !password) {
    return { error: "Fill in your name, email, and password.", checkEmail: false };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", checkEmail: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    return { error: error.message, checkEmail: false };
  }

  // If email confirmation is required by this Supabase project's auth
  // settings, there is no session yet — tell the user to confirm, rather
  // than silently redirecting to a page that will just bounce them to
  // /login.
  if (!data.session) {
    return { error: null, checkEmail: true };
  }

  redirect("/onboarding");
}
