import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import type { GradeLevel } from "@/types/database";
import { createStudent } from "../actions";

export default async function NewStudentPage() {
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  if (!isStaff || !ctx.activeSchool) redirect("/app");
  const school = ctx.activeSchool;

  const supabase = await createClient();
  const { data: gradeLevels } = await supabase
    .from("grade_levels")
    .select("*")
    .eq("school_id", school.id)
    .order("sort_order");

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Add student</h1>
      <form action={createStudent.bind(null, school.id)} className="space-y-4">
        <label className="block text-sm text-ink">
          Name
          <input name="name" required className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm text-ink">
          Grade
          <select name="grade_level_id" className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm">
            <option value="">Unassigned</option>
            {(gradeLevels as GradeLevel[] | null)?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-ink">
          Student number (optional)
          <input name="student_number" className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm text-ink">
          Enrollment date (optional)
          <input type="date" name="enrollment_date" className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">
          Add student
        </button>
      </form>
    </div>
  );
}
