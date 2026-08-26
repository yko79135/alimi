"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolStaff, AuthError } from "@/lib/auth/require";
import { logAuditEvent } from "@/lib/audit/log";

export interface BehaviorFormState {
  error: string | null;
  success: string | null;
}

export async function createBehaviorRecord(
  schoolId: string,
  _prevState: BehaviorFormState,
  formData: FormData
): Promise<BehaviorFormState> {
  const studentId = String(formData.get("student_id") ?? "");
  const categoryId = String(formData.get("category_id") ?? "") || null;
  const kind = String(formData.get("kind") ?? "discipline") as "discipline" | "praise";
  const points = Number(formData.get("points") ?? 1);
  const reason = String(formData.get("reason") ?? "").trim();
  const guardianMessage = String(formData.get("guardian_message") ?? "").trim() || null;
  const teacherNote = String(formData.get("teacher_note") ?? "").trim() || null;
  const occurredOn = String(formData.get("occurred_on") ?? "").trim() || new Date().toISOString().slice(0, 10);

  if (!studentId || !reason) {
    return { error: "Choose a student and enter a reason.", success: null };
  }
  if (!Number.isFinite(points) || points < 1 || points > 20) {
    return { error: "Points must be between 1 and 20.", success: null };
  }

  try {
    const { supabase, user } = await requireSchoolStaff(schoolId);
    const delta = kind === "praise" ? points : -points;

    const { data, error } = await supabase
      .from("behavior_records")
      .insert({
        school_id: schoolId,
        student_id: studentId,
        category_id: categoryId,
        kind,
        points,
        delta,
        occurred_on: occurredOn,
        reason,
        guardian_message: guardianMessage,
        teacher_note: teacherNote,
        author_id: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { error: "Could not save this record. Please try again.", success: null };
    }

    await logAuditEvent(supabase, {
      schoolId,
      actorId: user.id,
      action: "behavior.create",
      targetType: "behavior_record",
      targetId: data.id,
      metadata: { kind, points },
    });

    revalidatePath("/app/behavior");
    return { error: null, success: "Saved." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, success: null };
    console.error(e);
    return { error: "Something went wrong.", success: null };
  }
}

// Edits an existing record in place (category/points/reason/messages/
// date) rather than appending a correction row — see the comment on
// 20260826010000_behavior_records_editable.sql for why that's an
// intentional, narrow departure from the append-only ledger design:
// staff need to fix a mis-entered record from the student's page, and
// the edit is still fully auditable (edited_at/edited_by on the row,
// full before/after in audit_logs).
export async function updateBehaviorRecord(
  schoolId: string,
  recordId: string,
  _prevState: BehaviorFormState,
  formData: FormData
): Promise<BehaviorFormState> {
  const categoryId = String(formData.get("category_id") ?? "") || null;
  const kind = String(formData.get("kind") ?? "discipline") as "discipline" | "praise";
  const points = Number(formData.get("points") ?? 1);
  const reason = String(formData.get("reason") ?? "").trim();
  const guardianMessage = String(formData.get("guardian_message") ?? "").trim() || null;
  const teacherNote = String(formData.get("teacher_note") ?? "").trim() || null;
  const occurredOn = String(formData.get("occurred_on") ?? "").trim();

  if (!reason || !occurredOn) {
    return { error: "Enter a reason and date.", success: null };
  }
  if (!Number.isFinite(points) || points < 1 || points > 20) {
    return { error: "Points must be between 1 and 20.", success: null };
  }

  try {
    const { supabase, user } = await requireSchoolStaff(schoolId);
    const delta = kind === "praise" ? points : -points;

    const { data: before } = await supabase
      .from("behavior_records")
      .select("kind, points, reason")
      .eq("id", recordId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!before) {
      return { error: "Record not found.", success: null };
    }

    const { error } = await supabase
      .from("behavior_records")
      .update({
        category_id: categoryId,
        kind,
        points,
        delta,
        occurred_on: occurredOn,
        reason,
        guardian_message: guardianMessage,
        teacher_note: teacherNote,
        edited_at: new Date().toISOString(),
        edited_by: user.id,
      })
      .eq("id", recordId)
      .eq("school_id", schoolId);

    if (error) {
      return { error: "Could not save changes. Please try again.", success: null };
    }

    await logAuditEvent(supabase, {
      schoolId,
      actorId: user.id,
      action: "behavior.update",
      targetType: "behavior_record",
      targetId: recordId,
      metadata: {
        before: { kind: before.kind, points: before.points, reason: before.reason },
        after: { kind, points, reason },
      },
    });

    revalidatePath("/app/students");
    return { error: null, success: "Saved." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, success: null };
    console.error(e);
    return { error: "Something went wrong.", success: null };
  }
}
