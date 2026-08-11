import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { SchoolSwitcher } from "./school-switcher";
import { SignOutButton } from "./sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveSchoolContext();

  if (!ctx.userId) {
    redirect("/login");
  }
  if (!ctx.activeSchool) {
    redirect("/onboarding");
  }

  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  const isAdmin = ctx.activeRoles.includes("school_admin");
  const isParent = ctx.activeRoles.includes("parent");

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/app" className="text-base font-semibold tracking-tight text-ink">
              Alimi
            </Link>
            {ctx.memberships.length > 1 ? (
              <SchoolSwitcher memberships={ctx.memberships} activeSchoolId={ctx.activeSchool.id} />
            ) : (
              <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand-strong">
                {ctx.activeSchool.name}
              </span>
            )}
          </div>
          <nav className="flex items-center gap-4 text-sm text-muted">
            {isStaff ? (
              <>
                <Link href="/app/dashboard" className="hover:text-ink">
                  Dashboard
                </Link>
                <Link href="/app/students" className="hover:text-ink">
                  Students
                </Link>
                <Link href="/app/notices" className="hover:text-ink">
                  Notices
                </Link>
                <Link href="/app/attendance" className="hover:text-ink">
                  Attendance
                </Link>
                <Link href="/app/behavior" className="hover:text-ink">
                  Behavior
                </Link>
                {isAdmin ? (
                  <>
                    <Link href="/app/staff" className="hover:text-ink">
                      Staff
                    </Link>
                    <Link href="/app/audit" className="hover:text-ink">
                      Audit log
                    </Link>
                    <Link href="/app/settings" className="hover:text-ink">
                      Settings
                    </Link>
                  </>
                ) : null}
              </>
            ) : null}
            {isParent ? (
              <Link href="/app/family" className="hover:text-ink">
                My Family
              </Link>
            ) : null}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
