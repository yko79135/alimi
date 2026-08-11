"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SCHOOL_COOKIE } from "@/lib/tenant/active-school";

export interface CreateSchoolState {
  error: string | null;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export async function createSchool(
  _prevState: CreateSchoolState,
  formData: FormData
): Promise<CreateSchoolState> {
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "Asia/Seoul");
  const locale = String(formData.get("locale") ?? "ko");

  if (!name) {
    return { error: "Enter your school's name." };
  }

  const slug = slugify(slugInput || name);
  if (!slug || slug.length < 2) {
    return { error: "Choose a valid URL slug (letters, numbers, hyphens)." };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("create_school_with_admin", {
    p_name: name,
    p_slug: slug,
    p_timezone: timezone,
    p_locale: locale,
  });

  if (error) {
    if (error.message.includes("schools_slug_key") || error.message.includes("duplicate key")) {
      return { error: `The slug "${slug}" is already taken. Try another.` };
    }
    return { error: "Could not create your school. Please try again." };
  }

  const schoolId = (data as { id: string } | null)?.id;
  if (schoolId) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_SCHOOL_COOKIE, schoolId, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  redirect("/app");
}
