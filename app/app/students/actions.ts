"use server";

import { revalidatePath } from "next/cache";
import { requireSchoolStaff, requireSchoolAdmin } from "@/lib/auth/require";
import { logAuditEvent } from "@/lib/audit/log";

export async function createStudent(schoolId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const gradeLevelId = String(formData.get("grade_level_id") ?? "").trim() || null;
  const studentNumber = String(formData.get("student_number") ?? "").trim() || null;
  const enrollmentDate = String(formData.get("enrollment_date") ?? "").trim() || null;
  if (!name) return;

  const { supabase, user } = await requireSchoolStaff(schoolId);
  const { data, error } = await supabase
    .from("students")
    .insert({
      school_id: schoolId,
      name,
      grade_level_id: gradeLevelId,
      student_number: studentNumber,
      enrollment_date: enrollmentDate,
    })
    .select("id")
    .single();
  if (error) return;

  await logAuditEvent(supabase, {
    schoolId,
    actorId: user.id,
    action: "student.create",
    targetType: "student",
    targetId: data.id,
    metadata: { name },
  });
  revalidatePath("/app/students");
}

export async function archiveStudent(schoolId: string, studentId: string) {
  const { supabase, user } = await requireSchoolStaff(schoolId);
  await supabase.from("students").update({ status: "archived" }).eq("id", studentId).eq("school_id", schoolId);
  await logAuditEvent(supabase, {
    schoolId,
    actorId: user.id,
    action: "student.archive",
    targetType: "student",
    targetId: studentId,
  });
  revalidatePath("/app/students");
}

export async function restoreStudent(schoolId: string, studentId: string) {
  const { supabase, user } = await requireSchoolStaff(schoolId);
  await supabase.from("students").update({ status: "active" }).eq("id", studentId).eq("school_id", schoolId);
  await logAuditEvent(supabase, {
    schoolId,
    actorId: user.id,
    action: "student.restore",
    targetType: "student",
    targetId: studentId,
  });
  revalidatePath("/app/students");
}

export async function deleteStudent(schoolId: string, studentId: string) {
  // Hard delete is rare and admin-only; archiving is preferred for
  // historical records (attendance/behavior/notices reference the
  // student and should normally be preserved).
  const { supabase, user } = await requireSchoolAdmin(schoolId);
  await supabase.from("students").delete().eq("id", studentId).eq("school_id", schoolId);
  await logAuditEvent(supabase, {
    schoolId,
    actorId: user.id,
    action: "student.delete",
    targetType: "student",
    targetId: studentId,
  });
  revalidatePath("/app/students");
}
