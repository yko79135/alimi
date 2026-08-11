import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { loadStaffDashboardMetrics } from "@/lib/dashboard/staff-metrics";
import { createClient } from "@/lib/supabase/server";

function MetricCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-shadow hover:shadow-md">
      {content}
    </Link>
  ) : (
    content
  );
}

function ChecklistItem({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
            done ? "bg-success text-white" : "border border-line text-muted"
          }`}
        >
          {done ? "✓" : ""}
        </span>
        <span className={done ? "text-muted line-through" : "text-ink"}>{label}</span>
      </div>
      {!done ? (
        <Link href={href} className="text-sm font-medium text-brand hover:underline">
          Set up
        </Link>
      ) : null}
    </li>
  );
}

export default async function StaffDashboardPage() {
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  if (!isStaff || !ctx.activeSchool) {
    redirect("/app");
  }

  const client = await createClient();
  const metrics = await loadStaffDashboardMetrics(client, ctx.activeSchool.id);

  const setupSteps = [
    { done: metrics.setup.hasGradeLevels, label: "Add grade levels", href: "/app/settings" },
    { done: metrics.setup.hasStudents, label: "Add or import students", href: "/app/students" },
    { done: metrics.setup.hasStaff, label: "Invite staff", href: "/app/staff" },
    { done: metrics.setup.hasParentLink, label: "Generate a parent signup link", href: "/app/settings" },
    { done: metrics.setup.hasNotice, label: "Send your first notice", href: "/app/notices" },
  ];
  const setupComplete = setupSteps.every((s) => s.done);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{ctx.activeSchool.name}</h1>
        <p className="mt-1 text-sm text-muted">Here&apos;s what&apos;s happening today.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Active students" value={metrics.activeStudents} href="/app/students" />
        <MetricCard label="Staff" value={metrics.staffCount} href="/app/staff" />
        <MetricCard label="Guardians" value={metrics.guardianCount} />
        <MetricCard label="Absent today" value={metrics.todayAbsent} href="/app/attendance" />
        <MetricCard label="Late today" value={metrics.todayLate} href="/app/attendance" />
        <MetricCard label="Confirmations waiting" value={metrics.confirmationsWaiting} href="/app/notices" />
      </div>

      {!setupComplete ? (
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-medium text-ink">Setup checklist</h2>
          <ul className="mt-2 divide-y divide-line">
            {setupSteps.map((step) => (
              <ChecklistItem key={step.label} {...step} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
