import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import type { GradeLevel, Student, StudentStatus } from "@/types/database";
import { archiveStudent, restoreStudent } from "./actions";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  if (!isStaff || !ctx.activeSchool) {
    redirect("/app");
  }
  const school = ctx.activeSchool;
  const { q, status } = await searchParams;
  const VALID_STATUSES: StudentStatus[] = ["active", "inactive", "archived"];
  const activeStatus: StudentStatus = VALID_STATUSES.includes(status as StudentStatus) ? (status as StudentStatus) : "active";

  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select("*, grade_level:grade_levels(name)")
    .eq("school_id", school.id)
    .eq("status", activeStatus)
    .order("name");
  if (q) {
    query = query.ilike("name", `%${q}%`);
  }
  const { data: students } = await query;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">Students</h1>
        <div className="flex gap-2">
          <a
            href={`/api/exports/students?schoolId=${school.id}`}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
          >
            Export CSV
          </a>
          <Link
            href="/app/students/import"
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-canvas"
          >
            Import CSV
          </Link>
          <Link href="/app/students/new" className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">
            Add student
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name"
          className="rounded-md border border-line px-3 py-2 text-sm"
        />
        <select name="status" defaultValue={activeStatus} className="rounded-md border border-line px-3 py-2 text-sm">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
        <button type="submit" className="rounded-md border border-line px-4 py-2 text-sm hover:bg-canvas">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Grade</th>
              <th className="px-4 py-3 font-medium">Student #</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(students as (Student & { grade_level: GradeLevel | null })[] | null)?.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">
                  <Link href={`/app/students/${s.id}`} className="font-medium text-ink hover:text-brand">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{s.grade_level?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{s.student_number ?? "—"}</td>
                <td className="px-4 py-3 text-muted capitalize">{s.status}</td>
                <td className="px-4 py-3 text-right">
                  {s.status === "archived" ? (
                    <form action={restoreStudent.bind(null, school.id, s.id)}>
                      <button type="submit" className="text-brand hover:underline">
                        Restore
                      </button>
                    </form>
                  ) : (
                    <form action={archiveStudent.bind(null, school.id, s.id)}>
                      <button type="submit" className="text-muted hover:text-danger">
                        Archive
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {!students || students.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No students found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
