import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import type { BehaviorCategory, Student } from "@/types/database";
import { BehaviorForm } from "./behavior-form";

export default async function BehaviorPage() {
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  if (!isStaff || !ctx.activeSchool) redirect("/app");
  const school = ctx.activeSchool;

  const supabase = await createClient();
  const [{ data: students }, { data: categories }, { data: recent }] = await Promise.all([
    supabase.from("students").select("id, name").eq("school_id", school.id).eq("status", "active").order("name"),
    supabase.from("behavior_categories").select("*").eq("school_id", school.id).eq("active", true).order("sort_order"),
    supabase
      .from("behavior_records")
      .select("*, student:students(name)")
      .eq("school_id", school.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Behavior</h1>
        <p className="mt-1 text-sm text-muted">Log conduct and praise records. Terminology is configurable per school.</p>
      </div>

      <BehaviorForm
        schoolId={school.id}
        students={(students as Pick<Student, "id" | "name">[] | null) ?? []}
        categories={(categories as BehaviorCategory[] | null) ?? []}
      />

      <div>
        <h2 className="text-sm font-medium text-muted">Recent</h2>
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
          {recent?.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <span className="font-medium text-ink">{(r.student as unknown as { name: string })?.name}</span>
                <span className="ml-2 text-muted">{r.reason}</span>
              </div>
              <span className={r.kind === "praise" ? "font-medium text-success" : "font-medium text-danger"}>
                {r.kind === "praise" ? "+" : "-"}
                {r.points}
              </span>
            </li>
          ))}
          {!recent || recent.length === 0 ? <li className="p-6 text-center text-muted">No records yet.</li> : null}
        </ul>
      </div>
    </div>
  );
}
