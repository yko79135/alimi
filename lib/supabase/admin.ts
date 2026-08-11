import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabasePublicConfig, getSupabaseServiceRoleKey } from "./config";

// Service-role client. Bypasses RLS entirely — every call site using this
// client is a manual trust boundary and MUST perform its own
// authorization check first (e.g. via lib/auth/require.ts). Reserved for:
// auth.admin.* user provisioning, minting storage signed URLs, and
// genuinely tenant-agnostic background/platform-admin operations. Never
// import this from a Client Component; "server-only" enforces that at
// build time.
export function createAdminClient() {
  const { url } = getSupabasePublicConfig();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
