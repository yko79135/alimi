import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";

export default async function AuditLogPage() {
  const ctx = await getActiveSchoolContext();
  if (!ctx.activeRoles.includes("school_admin") || !ctx.activeSchool) {
    redirect("/app");
  }
  const school = ctx.activeSchool;
  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*, actor:profiles(full_name, email)")
    .eq("school_id", school.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Audit log</h1>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs?.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 text-muted">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-ink">{(log.actor as unknown as { full_name: string })?.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-ink">{log.action}</td>
                <td className="px-4 py-3 text-muted">{log.target_type}</td>
              </tr>
            ))}
            {!logs || logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No activity yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
