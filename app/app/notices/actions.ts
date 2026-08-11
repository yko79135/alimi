"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireSchoolStaff, AuthError } from "@/lib/auth/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { sendNoticePush } from "@/lib/push/send";
import type { TargetScope } from "@/types/database";

export interface ComposeState {
  error: string | null;
}

export async function createNotice(
  schoolId: string,
  _prevState: ComposeState,
  formData: FormData
): Promise<ComposeState> {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const noticeTypeId = String(formData.get("notice_type_id") ?? "") || null;
  const targetScope = String(formData.get("target_scope") ?? "school") as TargetScope;
  const targetGradeLevelId = String(formData.get("target_grade_level_id") ?? "") || null;
  const targetHomeroomId = String(formData.get("target_homeroom_id") ?? "") || null;
  const studentIdsRaw = String(formData.get("student_ids") ?? "[]");
  const requiresConfirmation = formData.get("requires_confirmation") === "on";
  const attachmentPathsRaw = String(formData.get("attachment_paths") ?? "[]");
  const noticeId = String(formData.get("notice_id") ?? "").trim();

  if (!noticeId) {
    return { error: "Missing notice id. Please reload the page and try again." };
  }

  if (!title || !body) {
    return { error: "Enter a title and message." };
  }
  if (targetScope === "grade" && !targetGradeLevelId) {
    return { error: "Choose a grade to target." };
  }
  if (targetScope === "homeroom" && !targetHomeroomId) {
    return { error: "Choose a homeroom to target." };
  }
  let studentIds: string[] = [];
  if (targetScope === "student") {
    try {
      studentIds = JSON.parse(studentIdsRaw);
    } catch {
      studentIds = [];
    }
    if (studentIds.length === 0) {
      return { error: "Choose at least one student." };
    }
  }

  try {
    const { supabase, user } = await requireSchoolStaff(schoolId);

    const { data: notice, error } = await supabase
      .from("notices")
      .insert({
        id: noticeId,
        school_id: schoolId,
        notice_type_id: noticeTypeId,
        title,
        body,
        target_scope: targetScope,
        target_grade_level_id: targetScope === "grade" ? targetGradeLevelId : null,
        target_homeroom_id: targetScope === "homeroom" ? targetHomeroomId : null,
        requires_confirmation: requiresConfirmation,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !notice) {
      return { error: "Could not publish this notice. Please try again." };
    }

    if (targetScope === "student" && studentIds.length > 0) {
      await supabase.from("notice_students").insert(studentIds.map((studentId) => ({ notice_id: noticeId, student_id: studentId })));
    }

    let attachmentPaths: { path: string; fileName: string; mimeType: string; sizeBytes: number }[] = [];
    try {
      attachmentPaths = JSON.parse(attachmentPathsRaw);
    } catch {
      attachmentPaths = [];
    }
    if (attachmentPaths.length > 0) {
      await supabase.from("notice_attachments").insert(
        attachmentPaths.map((a) => ({
          notice_id: noticeId,
          school_id: schoolId,
          storage_path: a.path,
          file_name: a.fileName,
          mime_type: a.mimeType,
          size_bytes: a.sizeBytes,
          uploaded_by: user.id,
        }))
      );
    }

    await logAuditEvent(supabase, {
      schoolId,
      actorId: user.id,
      action: "notice.create",
      targetType: "notice",
      targetId: noticeId,
      metadata: { targetScope, title },
    });

    // Fire-and-forget: push delivery never blocks the durable write that
    // already committed above, and a slow/failing push provider can't
    // turn into a failed notice publish.
    after(() =>
      sendNoticePush({
        id: noticeId,
        school_id: schoolId,
        target_scope: targetScope,
        target_grade_level_id: targetScope === "grade" ? targetGradeLevelId : null,
        target_homeroom_id: targetScope === "homeroom" ? targetHomeroomId : null,
      })
    );
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong publishing this notice." };
  }

  revalidatePath("/app/notices");
  redirect(`/app/notices/${noticeId}`);
}

export async function deleteNotice(schoolId: string, noticeId: string) {
  const { supabase, user } = await requireSchoolStaff(schoolId);
  await supabase.from("notices").delete().eq("id", noticeId).eq("school_id", schoolId);
  await logAuditEvent(supabase, {
    schoolId,
    actorId: user.id,
    action: "notice.delete",
    targetType: "notice",
    targetId: noticeId,
  });
  revalidatePath("/app/notices");
}

// Signed upload URL for a PDF attachment, scoped to
// {school_id}/{notice_id}/{filename} exactly matching the bucket's
// documented path convention (see 0015_storage.sql). The client
// generates the notice's id up front (crypto.randomUUID()) before the
// notice row exists, uploads attachments under that id, then submits the
// same id when creating the notice — so the storage path is always a
// real (soon-to-be-real) notice id, never a placeholder. If the compose
// form is abandoned, this leaves an unreferenced storage object rather
// than a dangling DB row; a periodic cleanup job can sweep those (not
// implemented in v1 — see docs/ARCHITECTURE.md future work).
export async function createAttachmentUploadUrl(schoolId: string, noticeId: string, fileName: string) {
  await requireSchoolStaff(schoolId);
  const admin = createAdminClient();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const path = `${schoolId}/${noticeId}/${Date.now()}-${safeName}`;
  const { data, error } = await admin.storage.from("notice-attachments").createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error("Could not prepare file upload");
  }
  return { path, token: data.token, signedUrl: data.signedUrl };
}
