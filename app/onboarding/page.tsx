import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/login");
  }

  const { count } = await supabase
    .from("school_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userData.user.id)
    .eq("status", "active");

  if (count && count > 0) {
    redirect("/app");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
          Alimi
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Create your school</h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;ll become the first administrator. You can invite staff and
          import students right after.
        </p>
        <OnboardingForm />
        <p className="mt-6 text-sm text-muted">
          Waiting on an invite from your school instead? Ask your admin for a
          staff invite or parent signup link.
        </p>
      </div>
    </div>
  );
}
