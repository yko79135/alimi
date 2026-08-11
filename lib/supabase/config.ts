// Unlike Holga's config helper, this does not require the Supabase URL to
// end in `.supabase.co` — that was a single-vendor lock-in assumption
// (see docs/HOLGA_REFERENCE_AUDIT.md §8) not worth repeating. It still
// hard-fails on a missing/malformed URL so misconfiguration is caught at
// startup rather than producing confusing downstream errors.

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use https.");
  }

  return { url, key };
}

export function getSupabaseServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  return key;
}
