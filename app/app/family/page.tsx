import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import { loadGuardianDashboard } from "@/lib/dashboard/guardian-data";
import { todayIso, daysAgoIso } from "@/lib/utils/dates";
import { NoticeFeed } from "./notice-feed";
import { PushToggle } from "./push-toggle";

export default async function FamilyPage() {
  const ctx = await getActiveSchoolContext();
  if (!ctx.activeRoles.includes("parent") || !ctx.activeSchool) {
    redirect("/app");
  }
  const school = ctx.activeSchool;
  const supabase = await createClient();
  const { children, notices } = await loadGuardianDashboard(supabase, school.id, ctx.userId);

  const today = todayIso();
  const thirtyDaysAgo = daysAgoIso(30);

  const childSummaries = await Promise.all(
    children.map(async (c) => {
      const student = c.student as unknown as { id: string; name: string } | null;
      if (!student) return null;
      const [{ data: attendance }, { data: behavior }] = await Promise.all([
        supabase.rpc("guardian_attendance_entries", { p_student: student.id, p_from: thirtyDaysAgo, p_to: today }),
        supabase.rpc("guardian_behavior_records", { p_student: student.id, p_from: thirtyDaysAgo, p_to: today }),
      ]);
      return { student, attendance: attendance ?? [], behavior: behavior ?? [] };
    })
  );

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My family</h1>
          <p className="mt-1 text-sm text-muted">{school.name}</p>
        </div>
        <PushToggle schoolId={school.id} />
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted">Children</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {children.map((c, i) => {
            const student = c.student as unknown as {
              id: string;
              name: string;
              grade_level: { name: string } | null;
              homeroom: { name: string } | null;
            } | null;
            if (!student) return null;
            return (
              <div key={i} className="rounded-full border border-line bg-surface px-4 py-2 text-sm">
                <span className="font-medium text-ink">{student.name}</span>
                <span className="ml-2 text-muted">{student.grade_level?.name ?? ""}</span>
              </div>
            );
          })}
          {children.length === 0 ? <p className="text-sm text-muted">No children linked yet.</p> : null}
        </div>
      </section>

      {childSummaries.filter(Boolean).map((summary) => {
        if (!summary) return null;
        return (
          <section key={summary.student.id}>
            <h2 className="text-sm font-medium text-muted">{summary.student.name} — last 30 days</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Attendance</p>
                {summary.attendance.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No exceptions — all present.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {summary.attendance.slice(0, 5).map((a) => (
                      <li key={a.id} className="text-ink">
                        {a.attendance_date} — <span className="capitalize">{a.status.replace("_", " ")}</span>
                        {a.parent_visible_reason ? ` (${a.parent_visible_reason})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-line bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Behavior</p>
                {summary.behavior.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No records.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {summary.behavior.slice(0, 5).map((b) => (
                      <li key={b.id} className={b.kind === "praise" ? "text-success" : "text-ink"}>
                        {b.occurred_on} — {b.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        );
      })}

      <section>
        <h2 className="text-sm font-medium text-muted">Notices</h2>
        <NoticeFeed initialNotices={notices} />
      </section>
    </div>
  );
}
