import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";
import { createClient } from "@/lib/supabase/server";
import {
  addGradeLevel,
  removeGradeLevel,
  updateSchoolBranding,
  createParentSignupLink,
  deactivateParentSignupLink,
} from "./actions";
import type { GradeLevel, ParentSignupLink } from "@/types/database";

export default async function SettingsPage() {
  const ctx = await getActiveSchoolContext();
  if (!ctx.activeRoles.includes("school_admin") || !ctx.activeSchool) {
    redirect("/app");
  }
  const school = ctx.activeSchool;
  const supabase = await createClient();

  const [{ data: gradeLevels }, { data: links }] = await Promise.all([
    supabase.from("grade_levels").select("*").eq("school_id", school.id).order("sort_order"),
    supabase.from("parent_signup_links").select("*").eq("school_id", school.id).order("created_at", { ascending: false }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-ink">School settings</h1>
        <p className="mt-1 text-sm text-muted">Branding, academic structure, and parent onboarding.</p>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-ink">General</h2>
        <form action={updateSchoolBranding.bind(null, school.id)} className="mt-4 grid max-w-lg gap-3">
          <label className="text-sm text-ink">
            School name
            <input
              name="name"
              defaultValue={school.name}
              required
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-ink">
            Short name
            <input
              name="short_name"
              defaultValue={school.short_name ?? ""}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-ink">
            Contact email
            <input
              name="contact_email"
              type="email"
              defaultValue={school.contact_email ?? ""}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-ink">
            Accent color
            <input
              name="accent_color"
              type="text"
              placeholder="#2f6f5e"
              defaultValue={school.accent_color ?? ""}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-ink">
            Timezone
            <input
              name="timezone"
              defaultValue={school.timezone}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="mt-2 w-fit rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
          >
            Save
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-ink">Grade levels</h2>
        <p className="mt-1 text-sm text-muted">
          Your school&apos;s own grade labels — use whatever your school calls them.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {(gradeLevels as GradeLevel[] | null)?.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
              {g.name}
              <form action={removeGradeLevel.bind(null, school.id, g.id)}>
                <button type="submit" aria-label={`Remove ${g.name}`} className="text-muted hover:text-danger">
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addGradeLevel.bind(null, school.id)} className="mt-4 flex max-w-sm gap-2">
          <input
            name="name"
            required
            placeholder="e.g. Grade 1, 1학년, Kindergarten"
            className="flex-1 rounded-md border border-line px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-canvas">
            Add
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-medium text-ink">Parent onboarding</h2>
        <p className="mt-1 text-sm text-muted">
          Share a signup link with families. Each guardian must know the student&apos;s name, grade, and
          verification code (shown on each student&apos;s detail page) — this keeps signup safe without
          exposing your roster. See docs/MULTI_TENANCY.md for the full rationale.
        </p>

        <ul className="mt-4 divide-y divide-line">
          {(links as ParentSignupLink[] | null)?.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium text-ink">{link.label || "Parent signup"}</p>
                <p className="break-all text-xs text-muted">
                  {appUrl}/join/{link.token}
                </p>
                <p className="text-xs text-muted">
                  {link.active ? "Active" : "Inactive"} · {link.uses_count} used
                  {link.requires_approval ? " · requires admin approval" : ""}
                </p>
              </div>
              {link.active ? (
                <form action={deactivateParentSignupLink.bind(null, school.id, link.id)}>
                  <button type="submit" className="text-sm text-danger hover:underline">
                    Deactivate
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>

        <form action={createParentSignupLink.bind(null, school.id)} className="mt-4 grid max-w-sm gap-3">
          <input name="label" placeholder="Link label (e.g. Fall 2026)" className="rounded-md border border-line px-3 py-2 text-sm" />
          <select name="grade_level_id" className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="">Any grade</option>
            {(gradeLevels as GradeLevel[] | null)?.map((g) => (
              <option key={g.id} value={g.id}>
                Restrict to {g.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="requires_approval" />
            Require admin approval before linking
          </label>
          <button type="submit" className="w-fit rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">
            Create link
          </button>
        </form>
      </section>
    </div>
  );
}
