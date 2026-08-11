import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import type { GradeLevel } from "@/types/database";
import { ImportWizard } from "./import-wizard";

export default async function StudentImportPage() {
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Import students</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a CSV exported from Excel or another system. Download the template below to see the
          expected columns.
        </p>
      </div>
      <ImportWizard schoolId={school.id} gradeLevels={(gradeLevels as GradeLevel[] | null) ?? []} />
    </div>
  );
}
