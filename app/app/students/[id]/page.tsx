import { notFound, redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import type { BehaviorCategory, GradeLevel, Profile } from "@/types/database";
import { BehaviorRecordsTable } from "./behavior-records-table";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  if (!isStaff || !ctx.activeSchool) redirect("/app");
  const school = ctx.activeSchool;

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("*, grade_level:grade_levels(name)")
    .eq("id", id)
    .eq("school_id", school.id)
    .maybeSingle();

  if (!student) notFound();

  const [{ data: guardianLinks }, { count: attendanceCount }, { data: behaviorRecords }, { data: behaviorCategories }] =
    await Promise.all([
      supabase
        .from("guardian_students")
        .select("relationship, guardian:profiles(id, full_name, email, phone)")
        .eq("student_id", id),
      supabase.from("attendance_entries").select("id", { count: "exact", head: true }).eq("student_id", id),
      supabase
        .from("behavior_records")
        .select("id, category_id, kind, points, occurred_on, reason, guardian_message, teacher_note, edited_at")
        .eq("student_id", id)
        .order("occurred_on", { ascending: false }),
      supabase.from("behavior_categories").select("*").eq("school_id", school.id).eq("active", true).order("sort_order"),
    ]);

  const grade = (student as unknown as { grade_level: GradeLevel | null }).grade_level;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{student.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {grade?.name ?? "No grade assigned"} · {student.status}
        </p>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-ink">Guardian signup</h2>
        <p className="mt-1 text-sm text-muted">
          Give this verification code to the family, alongside your school&apos;s parent signup link. It is
          required (with the student&apos;s name and grade) to link a guardian account — never share it
          publicly. See docs/MULTI_TENANCY.md.
        </p>
        <p className="mt-3 inline-block rounded-md bg-canvas px-3 py-2 font-mono text-lg tracking-widest text-ink">
          {student.verification_code}
        </p>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-ink">Guardians</h2>
        {guardianLinks && guardianLinks.length > 0 ? (
          <ul className="mt-3 divide-y divide-line">
            {(guardianLinks as unknown as { relationship: string | null; guardian: Profile }[]).map((g) => (
              <li key={g.guardian.id} className="py-2">
                <p className="text-ink">{g.guardian.full_name || g.guardian.email}</p>
                <p className="text-xs text-muted">
                  {g.guardian.email} {g.relationship ? `· ${g.relationship}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No guardians linked yet.</p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <p className="text-sm text-muted">Attendance entries</p>
        <p className="mt-1 text-xl font-semibold text-ink">{attendanceCount ?? 0}</p>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-ink">Behavior records</h2>
        <p className="mt-1 text-sm text-muted">Click Edit on any row to correct it.</p>
        <BehaviorRecordsTable
          schoolId={school.id}
          records={behaviorRecords ?? []}
          categories={(behaviorCategories as BehaviorCategory[] | null) ?? []}
        />
      </section>
    </div>
  );
}
