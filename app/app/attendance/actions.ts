"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolStaff, AuthError } from "@/lib/auth/require";
import { logAuditEvent } from "@/lib/audit/log";
import type { AttendanceStatus } from "@/types/database";

export interface AttendanceSaveState {
  error: string | null;
  success: string | null;
}

interface Change {
  studentId: string;
  previousStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  reason: string;
}

export async function saveAttendance(
  schoolId: string,
  date: string,
  idempotencyKey: string,
  changes: Change[]
): Promise<AttendanceSaveState> {
  if (changes.length === 0) {
    return { error: null, success: "No changes to save." };
  }

  try {
    const { supabase, user } = await requireSchoolStaff(schoolId);

    const { data: existingBatch } = await supabase
      .from("attendance_change_batches")
      .select("id")
      .eq("school_id", schoolId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingBatch) {
      return { error: null, success: "Already saved." };
    }

    const { data: batch, error: batchError } = await supabase
      .from("attendance_change_batches")
      .insert({ school_id: schoolId, idempotency_key: idempotencyKey, author_id: user.id })
      .select("id")
      .single();
    if (batchError || !batch) {
      return { error: "Could not save attendance. Please try again.", success: null };
    }

    // Optimistic-concurrency check: recompute each student's current
    // status and compare to what the teacher's UI claimed it was when
    // they started editing, so a concurrent edit from another staff
    // member can't be silently overwritten.
    for (const change of changes) {
      const { data: current } = await supabase.rpc("attendance_current_status", {
        p_student: change.studentId,
        p_date: date,
      });
      if (current && current !== change.previousStatus) {
        return {
          error: `${change.studentId}: someone else already changed this student's attendance for this date. Reload and try again.`,
          success: null,
        };
      }
    }

    const rows = changes.map((c) => ({
      school_id: schoolId,
      student_id: c.studentId,
      attendance_date: date,
      status: c.newStatus,
      previous_status: c.previousStatus,
      change_type: c.previousStatus === "present" ? ("exception" as const) : ("correction" as const),
      parent_visible_reason: c.reason || null,
      batch_id: batch.id,
      author_id: user.id,
    }));

    const { error: insertError } = await supabase.from("attendance_entries").insert(rows);
    if (insertError) {
      return { error: "Could not save attendance. Please try again.", success: null };
    }

    await logAuditEvent(supabase, {
      schoolId,
      actorId: user.id,
      action: "attendance.save",
      targetType: "attendance_change_batch",
      targetId: batch.id,
      metadata: { date, count: rows.length },
    });

    revalidatePath("/app/attendance");
    return { error: null, success: `Saved ${rows.length} change(s).` };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, success: null };
    console.error(e);
    return { error: "Something went wrong saving attendance.", success: null };
  }
}
