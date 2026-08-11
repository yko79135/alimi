import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Writes through the caller's own RLS-scoped client (audit_logs INSERT
// policy requires is_school_staff + actor_id = auth.uid()), so a log
// entry can never be forged as another user. Never pass full record
// bodies in `metadata` — ids and small, non-sensitive summary fields
// only (see docs/SECURITY.md).
export async function logAuditEvent(
  supabase: SupabaseClient<Database>,
  params: {
    schoolId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("audit_logs").insert({
    school_id: params.schoolId,
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) {
    console.error("Failed to write audit log entry:", error);
  }
}
