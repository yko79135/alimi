"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface JoinState {
  error: string | null;
}

interface ChildInput {
  name: string;
  gradeLevelId: string;
  verificationCode: string;
  relationship: string;
}

export async function joinViaInvite(
  token: string,
  _prevState: JoinState,
  formData: FormData
): Promise<JoinState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const childrenRaw = String(formData.get("children") ?? "[]");

  if (!fullName || !email || !password) {
    return { error: "Fill in your name, email, and password." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  let children: ChildInput[];
  try {
    children = JSON.parse(childrenRaw);
  } catch {
    return { error: "Add at least one child." };
  }
  if (!Array.isArray(children) || children.length === 0) {
    return { error: "Add at least one child." };
  }
  if (children.length > 5) {
    return { error: "You can link up to 5 children per signup." };
  }
  for (const child of children) {
    if (!child.name?.trim() || !child.gradeLevelId || !child.verificationCode?.trim()) {
      return { error: "Each child needs a name, grade, and verification code." };
    }
  }

  const adminClient = createAdminClient();

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    if (createError?.message?.toLowerCase().includes("already")) {
      return { error: "An account already exists for this email. Log in instead, then ask your school for this link again." };
    }
    return { error: "Could not create your account. Please try again." };
  }

  const { data: redeemed, error: redeemError } = await adminClient.rpc("redeem_parent_signup_invite", {
    p_token: token,
    p_guardian_id: created.user.id,
    p_children: children.map((c) => ({
      name: c.name.trim(),
      grade_level_id: c.gradeLevelId,
      verification_code: c.verificationCode.trim(),
      relationship: c.relationship?.trim() || null,
    })),
  });

  if (redeemError) {
    // Roll back the just-created account so no dangling, unlinked auth
    // user is left behind — mirrors the atomic-rollback pattern used
    // throughout Holga's account-creation routes.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return { error: "This signup link is no longer valid. Ask your school for a new one." };
  }

  const results = (redeemed as { results: { name: string; status: string }[] })?.results ?? [];
  const anyMatched = results.some((r) => r.status === "auto_approved" || r.status === "pending");
  if (!anyMatched) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return {
      error:
        "We couldn't match any child to this school's roster. Double-check the name, grade, and verification code with your school.",
    };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    redirect("/login");
  }

  redirect("/app");
}
