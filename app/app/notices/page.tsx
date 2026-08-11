import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import type { Notice, NoticeType } from "@/types/database";

export default async function NoticesPage() {
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  if (!isStaff || !ctx.activeSchool) redirect("/app");
  const school = ctx.activeSchool;

  const supabase = await createClient();
  const { data: notices } = await supabase
    .from("notices")
    .select("*, notice_type:notice_types(label, color)")
    .eq("school_id", school.id)
    .order("published_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Notices</h1>
        <Link href="/app/notices/new" className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">
          New notice
        </Link>
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {(notices as (Notice & { notice_type: NoticeType | null })[] | null)?.map((n) => (
          <li key={n.id} className="p-4">
            <Link href={`/app/notices/${n.id}`} className="block">
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: n.notice_type?.color ?? "#4b8792" }}
                >
                  {n.notice_type?.label ?? "Notice"}
                </span>
                <span className="text-xs uppercase tracking-wide text-muted">{n.target_scope}</span>
              </div>
              <h2 className="mt-1 font-medium text-ink">{n.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{n.body}</p>
              <p className="mt-1 text-xs text-muted">{new Date(n.published_at).toLocaleString()}</p>
            </Link>
          </li>
        ))}
        {!notices || notices.length === 0 ? (
          <li className="p-8 text-center text-muted">No notices yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
