import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { MembershipRole, School } from "@/types/database";

export const ACTIVE_SCHOOL_COOKIE = "alimi_active_school";

export interface MembershipSummary {
  school: School;
  roles: MembershipRole[];
}

export interface ActiveSchoolContext {
  userId: string;
  memberships: MembershipSummary[];
  activeSchool: School | null;
  activeRoles: MembershipRole[];
}

// Resolves which school a signed-in user is currently acting in. A user
// belonging to only one school skips any switcher UI entirely (see
// product brief: "very simple experience without unnecessary
// tenant-management UI"). The cookie is only ever a hint about which of
// the user's OWN memberships to prefer — every server action still
// re-verifies membership via requireSchoolRole() before trusting a
// school_id, so a tampered cookie can at most switch which of the user's
// real schools they're viewing, never grant access to one they don't
// belong to.
export async function getActiveSchoolContext(): Promise<ActiveSchoolContext> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return { userId: "", memberships: [], activeSchool: null, activeRoles: [] };
  }

  const { data: rows } = await supabase
    .from("school_memberships")
    .select("role, school:schools(*)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const bySchool = new Map<string, MembershipSummary>();
  for (const row of rows ?? []) {
    const school = row.school as unknown as School | null;
    if (!school) continue;
    const existing = bySchool.get(school.id);
    if (existing) {
      existing.roles.push(row.role);
    } else {
      bySchool.set(school.id, { school, roles: [row.role] });
    }
  }
  const memberships = Array.from(bySchool.values());

  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value;
  const preferred = preferredId ? memberships.find((m) => m.school.id === preferredId) : undefined;
  const active = preferred ?? memberships[0];

  return {
    userId: user.id,
    memberships,
    activeSchool: active?.school ?? null,
    activeRoles: active?.roles ?? [],
  };
}
