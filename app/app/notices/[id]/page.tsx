import { notFound, redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import type { NoticeAttachment } from "@/types/database";
import { deleteNotice } from "../actions";

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  if (!isStaff || !ctx.activeSchool) redirect("/app");
  const school = ctx.activeSchool;

  const supabase = await createClient();
  const { data: notice } = await supabase
    .from("notices")
    .select("*, notice_type:notice_types(label, color)")
    .eq("id", id)
    .eq("school_id", school.id)
    .maybeSingle();
  if (!notice) notFound();

  const [{ data: attachments }, { data: acks }] = await Promise.all([
    supabase.from("notice_attachments").select("*").eq("notice_id", id),
    supabase.from("acknowledgements").select("read_at, confirmed_at, parent_reply, replied_at, guardian:profiles(full_name, email)").eq("notice_id", id),
  ]);

  const total = acks?.length ?? 0;
  const read = acks?.filter((a) => a.read_at).length ?? 0;
  const confirmed = acks?.filter((a) => a.confirmed_at).length ?? 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{notice.title}</h1>
        <p className="mt-1 text-sm text-muted">{new Date(notice.published_at).toLocaleString()}</p>
      </div>

      <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface p-4 text-sm text-ink">{notice.body}</p>

      {attachments && attachments.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium text-ink">Attachments</h2>
          <ul className="mt-1 space-y-1">
            {(attachments as NoticeAttachment[]).map((a) => (
              <li key={a.id}>
                <a href={`/api/attachments/${a.id}`} className="text-sm text-brand hover:underline">
                  {a.file_name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notice.requires_confirmation ? (
        <div className="rounded-lg border border-line bg-surface p-4 text-sm">
          <p className="text-ink">
            {read}/{total} read · {confirmed}/{total} confirmed
          </p>
        </div>
      ) : null}

      {acks && acks.some((a) => a.parent_reply) ? (
        <div>
          <h2 className="text-sm font-medium text-ink">Replies</h2>
          <ul className="mt-2 space-y-3">
            {acks
              .filter((a) => a.parent_reply)
              .map((a, i) => (
                <li key={i} className="rounded-md border border-line bg-surface p-3 text-sm">
                  <p className="font-medium text-ink">
                    {(a.guardian as unknown as { full_name: string })?.full_name ?? "Guardian"}
                  </p>
                  <p className="mt-1 text-ink">{a.parent_reply}</p>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <form action={deleteNotice.bind(null, school.id, notice.id)}>
        <button type="submit" className="text-sm text-danger hover:underline">
          Delete notice
        </button>
      </form>
    </div>
  );
}
