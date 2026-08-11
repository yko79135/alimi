import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import { deactivateStaffMembership, reactivateStaffMembership, cancelPendingInvite } from "./actions";
import { InviteStaffForm } from "./invite-form";

interface MembershipRow {
  id: string;
  role: string;
  status: string;
  user_id: string;
  profile: Profile | null;
}

export default async function StaffPage() {
  const ctx = await getActiveSchoolContext();
  if (!ctx.activeRoles.includes("school_admin") || !ctx.activeSchool) {
    redirect("/app");
  }
  const school = ctx.activeSchool;

  const supabase = await createClient();
  const { data } = await supabase
    .from("school_memberships")
    .select("id, role, status, user_id, profile:profiles(*)")
    .eq("school_id", school.id)
    .in("role", ["school_admin", "teacher"])
    .order("status");

  const memberships = (data as unknown as MembershipRow[] | null) ?? [];

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Staff</h1>
        <p className="mt-1 text-sm text-muted">Invite teachers and administrators. No passwords to hand out.</p>
      </div>

      <InviteStaffForm schoolId={school.id} />

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name / Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {memberships.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3">
                  <p className="text-ink">{m.profile?.full_name || m.profile?.email}</p>
                  <p className="text-xs text-muted">{m.profile?.email}</p>
                </td>
                <td className="px-4 py-3 capitalize text-muted">{m.role.replace("_", " ")}</td>
                <td className="px-4 py-3 capitalize text-muted">{m.status}</td>
                <td className="px-4 py-3 text-right">
                  {m.status === "invited" ? (
                    <form action={cancelPendingInvite.bind(null, school.id, m.id)}>
                      <button type="submit" className="text-danger hover:underline">
                        Cancel invite
                      </button>
                    </form>
                  ) : m.status === "active" ? (
                    <form action={deactivateStaffMembership.bind(null, school.id, m.id)}>
                      <button type="submit" className="text-muted hover:text-danger">
                        Deactivate
                      </button>
                    </form>
                  ) : (
                    <form action={reactivateStaffMembership.bind(null, school.id, m.id)}>
                      <button type="submit" className="text-brand hover:underline">
                        Reactivate
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {memberships.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No staff yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
