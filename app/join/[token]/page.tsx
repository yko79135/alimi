import { createClient } from "@/lib/supabase/server";
import { JoinForm } from "./join-form";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: linkRows } = await supabase.rpc("get_active_signup_link", { p_token: token });
  const link = linkRows?.[0] ?? null;

  if (!link) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink">This link isn&apos;t available</h1>
          <p className="mt-2 text-sm text-muted">
            It may have expired or been deactivated. Ask your school for a current signup link.
          </p>
        </div>
      </div>
    );
  }

  const { data: gradeLevels } = await supabase.rpc("get_school_grade_levels_public", {
    p_school_id: link.school_id,
  });

  return (
    <div className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-ink">Join {link.school_name}</h1>
        <p className="mt-1 text-sm text-muted">
          Create your guardian account and link your children. You&apos;ll need each child&apos;s name,
          grade, and the verification code your school gave you.
        </p>
        {link.requires_approval ? (
          <p className="mt-2 rounded-md bg-brand-soft px-3 py-2 text-sm text-brand-strong">
            Matches will be reviewed by the school before you see their information.
          </p>
        ) : null}
        <JoinForm
          token={token}
          gradeLevels={gradeLevels ?? []}
          restrictedGradeLevelId={link.grade_level_id}
        />
      </div>
    </div>
  );
}
