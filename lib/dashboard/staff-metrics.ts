import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export interface StaffDashboardMetrics {
  activeStudents: number;
  staffCount: number;
  guardianCount: number;
  todayAbsent: number;
  todayLate: number;
  confirmationsWaiting: number;
  setup: {
    hasGradeLevels: boolean;
    hasStudents: boolean;
    hasStaff: boolean;
    hasNotice: boolean;
    hasParentLink: boolean;
  };
}

// Every query here is scoped by school_id AND relies on the caller's own
// RLS-scoped client, so even a bug in this function's WHERE clauses can't
// leak another tenant's counts — RLS is the actual boundary.
export async function loadStaffDashboardMetrics(
  supabase: SupabaseClient<Database>,
  schoolId: string
): Promise<StaffDashboardMetrics> {
  const today = new Date().toISOString().slice(0, 10);

  const [
    studentsRes,
    staffRes,
    guardianRes,
    todayEntriesRes,
    unconfirmedRes,
    gradeLevelsRes,
    anyStudentRes,
    noticeRes,
    linkRes,
  ] = await Promise.all([
    supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
    supabase
      .from("school_memberships")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "active")
      .in("role", ["school_admin", "teacher"]),
    supabase
      .from("school_memberships")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "active")
      .eq("role", "parent"),
    supabase
      .from("attendance_entries")
      .select("student_id, status, created_at")
      .eq("school_id", schoolId)
      .eq("attendance_date", today)
      .order("created_at", { ascending: false }),
    supabase
      .from("acknowledgements")
      .select("notice_id, notices!inner(requires_confirmation)")
      .eq("school_id", schoolId)
      .is("confirmed_at", null)
      .not("read_at", "is", null)
      .eq("notices.requires_confirmation", true),
    supabase.from("grade_levels").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("notices").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("parent_signup_links").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
  ]);

  const latestByStudent = new Map<string, string>();
  for (const row of todayEntriesRes.data ?? []) {
    if (!latestByStudent.has(row.student_id)) {
      latestByStudent.set(row.student_id, row.status);
    }
  }
  let todayAbsent = 0;
  let todayLate = 0;
  for (const status of latestByStudent.values()) {
    if (status === "absent") todayAbsent += 1;
    if (status === "late") todayLate += 1;
  }

  return {
    activeStudents: studentsRes.count ?? 0,
    staffCount: staffRes.count ?? 0,
    guardianCount: guardianRes.count ?? 0,
    todayAbsent,
    todayLate,
    confirmationsWaiting: unconfirmedRes.data?.length ?? 0,
    setup: {
      hasGradeLevels: (gradeLevelsRes.count ?? 0) > 0,
      hasStudents: (anyStudentRes.count ?? 0) > 0,
      hasStaff: (staffRes.count ?? 0) > 1,
      hasNotice: (noticeRes.count ?? 0) > 0,
      hasParentLink: (linkRes.count ?? 0) > 0,
    },
  };
}
