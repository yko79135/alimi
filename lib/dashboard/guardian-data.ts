import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { FeedNotice } from "@/app/app/family/notice-feed";

// RLS already restricts every one of these queries to what this guardian
// is actually entitled to see (their own linked children, and notices
// targeted at those children/grades/the whole school) — this function
// does not add any additional filtering, it relies entirely on Postgres
// RLS as the real boundary. See supabase/migrations/*_notices.sql.
//
// Embedded foreign-table selects below (e.g. notice_type:notice_types(...))
// are cast with `as unknown as` because types/database.ts declares empty
// Relationships for every table (see the comment on TableDef there) —
// Supabase's typed query parser can't resolve embeds without that
// metadata and would otherwise type them as SelectQueryError. The actual
// runtime query is unaffected; only compile-time inference is.
export async function loadGuardianDashboard(supabase: SupabaseClient<Database>, schoolId: string, guardianId: string) {
  const [{ data: children }, { data: notices }] = await Promise.all([
    supabase
      .from("guardian_students")
      .select("relationship, student:students(id, name, grade_level:grade_levels(name), homeroom:homerooms(name))")
      .eq("school_id", schoolId)
      .eq("guardian_id", guardianId),
    supabase
      .from("notices")
      .select(
        "id, school_id, title, body, published_at, requires_confirmation, notice_type:notice_types(label, color, is_positive), acknowledgement:acknowledgements(read_at, confirmed_at, parent_reply, replied_at)"
      )
      .eq("school_id", schoolId)
      .order("published_at", { ascending: false })
      .limit(50),
  ]);

  return { children: children ?? [], notices: (notices ?? []) as unknown as FeedNotice[] };
}
