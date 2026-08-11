import { createClient } from "@/lib/supabase/server";
import type { MembershipRole } from "@/types/database";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

// Always resolve the user from their own session — never trust a
// client-supplied user id.
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new AuthError("Authentication required", 401);
  }
  return { supabase, user: data.user };
}

// The single chokepoint for "does this user actually belong to this
// school with one of these roles." A school_id arriving from the browser
// (a route param, a form field, a header) must always be checked here
// before being used for anything — never trusted on its own. See
// docs/MULTI_TENANCY.md.
export async function requireSchoolRole(schoolId: string, roles: MembershipRole[]) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("school_memberships")
    .select("role")
    .eq("school_id", schoolId)
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    throw new AuthError("Failed to verify school membership", 500);
  }

  const userRoles = (data ?? []).map((m) => m.role);
  const authorized = roles.some((r) => userRoles.includes(r));
  if (!authorized) {
    throw new AuthError("Not authorized for this school", 403);
  }

  return { supabase, user, roles: userRoles };
}

export async function requireSchoolStaff(schoolId: string) {
  return requireSchoolRole(schoolId, ["school_admin", "teacher"]);
}

export async function requireSchoolAdmin(schoolId: string) {
  return requireSchoolRole(schoolId, ["school_admin"]);
}

export async function requirePlatformAdmin() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || !data) {
    throw new AuthError("Platform admin access required", 403);
  }
  return { supabase, user };
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Unhandled server error:", error);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
