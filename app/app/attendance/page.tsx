import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/utils/dates";
import type { AttendanceStatus, Homeroom } from "@/types/database";
import { AttendanceGrid } from "./attendance-grid";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; homeroom?: string }>;
}) {
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  if (!isStaff || !ctx.activeSchool) redirect("/app");
  const school = ctx.activeSchool;

  const { date, homeroom } = await searchParams;
  const attendanceDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso();

  const supabase = await createClient();
  const { data: homerooms } = await supabase
    .from("homerooms")
    .select("*")
    .eq("school_id", school.id)
    .eq("active", true)
    .order("name");

  const homeroomId = homeroom || (homerooms as Homeroom[] | null)?.[0]?.id || "";

  let students: { id: string; name: string }[] = [];
  if (homeroomId) {
    const { data } = await supabase
      .from("students")
      .select("id, name")
      .eq("school_id", school.id)
      .eq("homeroom_id", homeroomId)
      .eq("status", "active")
      .order("name");
    students = data ?? [];
  }

  let existingByStudent: Record<string, AttendanceStatus> = {};
  if (students.length > 0) {
    const { data: entries } = await supabase
      .from("attendance_entries")
      .select("student_id, status, created_at")
      .eq("school_id", school.id)
      .eq("attendance_date", attendanceDate)
      .in(
        "student_id",
        students.map((s) => s.id)
      )
      .order("created_at", { ascending: false });
    const latest: Record<string, AttendanceStatus> = {};
    for (const e of entries ?? []) {
      if (!(e.student_id in latest)) latest[e.student_id] = e.status;
    }
    existingByStudent = latest;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Attendance</h1>

      <form className="flex flex-wrap gap-3" method="get">
        <input type="date" name="date" defaultValue={attendanceDate} className="rounded-md border border-line px-3 py-2 text-sm" />
        <select name="homeroom" defaultValue={homeroomId} className="rounded-md border border-line px-3 py-2 text-sm">
          {(homerooms as Homeroom[] | null)?.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-line px-4 py-2 text-sm hover:bg-canvas">
          Go
        </button>
      </form>

      {students.length > 0 ? (
        <AttendanceGrid
          schoolId={school.id}
          date={attendanceDate}
          students={students}
          existingStatus={existingByStudent}
        />
      ) : (
        <p className="text-sm text-muted">
          {homerooms && homerooms.length > 0 ? "No active students in this homeroom." : "Create a homeroom in Settings first."}
        </p>
      )}
    </div>
  );
}
