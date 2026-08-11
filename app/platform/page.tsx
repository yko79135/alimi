import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Plan, School, Subscription } from "@/types/database";
import { suspendSchool, reactivateSchool, changeSchoolPlan } from "./actions";

export default async function PlatformAdminPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/app");

  const [{ data: schools }, { data: subscriptions }, { data: plans }] = await Promise.all([
    supabase.from("schools").select("*").order("created_at", { ascending: false }),
    supabase.from("subscriptions").select("*"),
    supabase.from("plans").select("*").order("monthly_price_cents", { ascending: true, nullsFirst: true }),
  ]);

  const subsBySchool = new Map((subscriptions as Subscription[] | null)?.map((s) => [s.school_id, s]));

  const counts = await Promise.all(
    (schools as School[] | null ?? []).map(async (school) => {
      const [{ count: students }, { count: staff }, { count: guardians }] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", school.id).eq("status", "active"),
        supabase
          .from("school_memberships")
          .select("id", { count: "exact", head: true })
          .eq("school_id", school.id)
          .in("role", ["school_admin", "teacher"])
          .eq("status", "active"),
        supabase
          .from("school_memberships")
          .select("id", { count: "exact", head: true })
          .eq("school_id", school.id)
          .eq("role", "parent")
          .eq("status", "active"),
      ]);
      return { schoolId: school.id, students: students ?? 0, staff: staff ?? 0, guardians: guardians ?? 0 };
    })
  );
  const countsBySchool = new Map(counts.map((c) => [c.schoolId, c]));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Platform administration</h1>
      <p className="mt-1 text-sm text-muted">
        Operational overview across every school on this Alimi deployment. Individual student records and
        messages are never shown here — this is a SaaS administration console, not a surveillance console.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Subscription</th>
              <th className="px-4 py-3 font-medium">Students</th>
              <th className="px-4 py-3 font-medium">Staff</th>
              <th className="px-4 py-3 font-medium">Guardians</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(schools as School[] | null)?.map((school) => {
              const sub = subsBySchool.get(school.id);
              const count = countsBySchool.get(school.id);
              return (
                <tr key={school.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{school.name}</p>
                    <p className="text-xs text-muted">{school.slug}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{school.status}</td>
                  <td className="px-4 py-3">
                    <form action={changeSchoolPlan.bind(null, school.id)}>
                      <select
                        name="plan_id"
                        defaultValue={sub?.plan_id ?? ""}
                        onChange={(e) => e.currentTarget.form?.requestSubmit()}
                        className="rounded-md border border-line px-2 py-1 text-xs"
                      >
                        <option value="">No plan</option>
                        {(plans as Plan[] | null)?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </form>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{sub?.status ?? "—"}</td>
                  <td className="px-4 py-3 text-ink">{count?.students ?? 0}</td>
                  <td className="px-4 py-3 text-ink">{count?.staff ?? 0}</td>
                  <td className="px-4 py-3 text-ink">{count?.guardians ?? 0}</td>
                  <td className="px-4 py-3 text-muted">{new Date(school.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    {school.status === "active" ? (
                      <form action={suspendSchool.bind(null, school.id)}>
                        <button type="submit" className="text-danger hover:underline">
                          Suspend
                        </button>
                      </form>
                    ) : (
                      <form action={reactivateSchool.bind(null, school.id)}>
                        <button type="submit" className="text-brand hover:underline">
                          Reactivate
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {!schools || schools.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted">
                  No schools yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
