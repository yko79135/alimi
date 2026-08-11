import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import type { GradeLevel, Homeroom, NoticeType, Student } from "@/types/database";
import { ComposeForm } from "./compose-form";

export default async function NewNoticePage() {
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  if (!isStaff || !ctx.activeSchool) redirect("/app");
  const school = ctx.activeSchool;

  const supabase = await createClient();
  const [{ data: noticeTypes }, { data: gradeLevels }, { data: homerooms }, { data: students }] = await Promise.all([
    supabase.from("notice_types").select("*").eq("school_id", school.id).eq("active", true).order("sort_order"),
    supabase.from("grade_levels").select("*").eq("school_id", school.id).order("sort_order"),
    supabase.from("homerooms").select("*").eq("school_id", school.id).eq("active", true).order("name"),
    supabase.from("students").select("id, name").eq("school_id", school.id).eq("status", "active").order("name"),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">New notice</h1>
      <ComposeForm
        schoolId={school.id}
        noticeTypes={(noticeTypes as NoticeType[] | null) ?? []}
        gradeLevels={(gradeLevels as GradeLevel[] | null) ?? []}
        homerooms={(homerooms as Homeroom[] | null) ?? []}
        students={(students as Pick<Student, "id" | "name">[] | null) ?? []}
      />
    </div>
  );
}
