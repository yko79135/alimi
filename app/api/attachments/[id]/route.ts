import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Visibility is checked with the caller's OWN RLS-scoped client first —
// notice_attachments SELECT mirrors notices_select exactly (see
// docs/HOLGA_REFERENCE_AUDIT.md §3), so a lookup returning nothing means
// RLS denied it. Only after that check passes do we switch to the admin
// client to mint a short-lived signed URL; the admin client is never
// used to decide access, only to produce the URL once access is proven.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: attachment } = await supabase.from("notice_attachments").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!attachment) {
    return new Response("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("notice-attachments").createSignedUrl(attachment.storage_path, 60);
  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }

  return Response.redirect(data.signedUrl, 302);
}
