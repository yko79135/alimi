import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabasePublicConfig } from "./config";

// The RLS-scoped, per-request client. Almost every read and write in this
// app should go through this client (or the browser client), not the
// admin client, so Postgres RLS remains the real enforcement layer — see
// docs/SECURITY.md and docs/HOLGA_REFERENCE_AUDIT.md §1.
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabasePublicConfig();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes
          // the session on every request instead.
        }
      },
    },
  });
}
