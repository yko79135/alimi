import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteForm } from "./accept-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>;
}) {
  const { school: schoolId } = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/login");
  }
  if (!schoolId) {
    redirect("/app");
  }

  const { data: school } = await supabase.from("schools").select("name").eq("id", schoolId).maybeSingle();

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-ink">
          Join {school?.name ?? "your school"}
        </h1>
        <p className="mt-1 text-sm text-muted">Set a password to finish setting up your account.</p>
        <AcceptInviteForm schoolId={schoolId} />
      </div>
    </div>
  );
}
