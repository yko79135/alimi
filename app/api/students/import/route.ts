import { requireSchoolStaff, authErrorResponse } from "@/lib/auth/require";
import { logAuditEvent } from "@/lib/audit/log";

interface ImportRow {
  name: string;
  gradeLevelId: string | null;
  studentNumber: string | null;
  enrollmentDate: string | null;
}

interface RowResult {
  index: number;
  name: string;
  status: "inserted" | "skipped_duplicate" | "invalid";
  reason?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { schoolId?: string; rows?: ImportRow[] };
    const schoolId = body.schoolId;
    const rows = body.rows ?? [];
    if (!schoolId) {
      return Response.json({ error: "schoolId is required" }, { status: 400 });
    }
    if (rows.length === 0) {
      return Response.json({ error: "No rows to import" }, { status: 400 });
    }
    if (rows.length > 2000) {
      return Response.json({ error: "Import is limited to 2000 rows at a time" }, { status: 400 });
    }

    const { supabase, user } = await requireSchoolStaff(schoolId);

    const { data: gradeLevels } = await supabase.from("grade_levels").select("id").eq("school_id", schoolId);
    const validGradeIds = new Set((gradeLevels ?? []).map((g) => g.id));

    const { data: existingStudents } = await supabase
      .from("students")
      .select("name, grade_level_id")
      .eq("school_id", schoolId)
      .eq("status", "active");
    const existingKeys = new Set(
      (existingStudents ?? []).map((s) => `${normalize(s.name)}::${s.grade_level_id ?? ""}`)
    );

    const results: RowResult[] = [];
    const toInsert: { school_id: string; name: string; grade_level_id: string | null; student_number: string | null; enrollment_date: string | null }[] = [];
    const seenInBatch = new Set<string>();

    rows.forEach((row, index) => {
      const name = (row.name ?? "").trim();
      if (!name) {
        results.push({ index, name, status: "invalid", reason: "Name is required" });
        return;
      }
      if (name.length > 200) {
        results.push({ index, name, status: "invalid", reason: "Name is too long" });
        return;
      }
      const gradeLevelId = row.gradeLevelId && validGradeIds.has(row.gradeLevelId) ? row.gradeLevelId : null;
      if (row.gradeLevelId && !gradeLevelId) {
        results.push({ index, name, status: "invalid", reason: "Grade does not match this school" });
        return;
      }
      const enrollmentDate = row.enrollmentDate && DATE_RE.test(row.enrollmentDate) ? row.enrollmentDate : null;
      if (row.enrollmentDate && !enrollmentDate) {
        results.push({ index, name, status: "invalid", reason: "Enrollment date must be YYYY-MM-DD" });
        return;
      }

      const key = `${normalize(name)}::${gradeLevelId ?? ""}`;
      if (existingKeys.has(key) || seenInBatch.has(key)) {
        results.push({ index, name, status: "skipped_duplicate", reason: "Matches an existing active student" });
        return;
      }
      seenInBatch.add(key);

      toInsert.push({
        school_id: schoolId,
        name,
        grade_level_id: gradeLevelId,
        student_number: row.studentNumber?.trim() || null,
        enrollment_date: enrollmentDate,
      });
      results.push({ index, name, status: "inserted" });
    });

    if (toInsert.length > 0) {
      const { error } = await supabase.from("students").insert(toInsert);
      if (error) {
        return Response.json({ error: "Import failed; no rows were saved. Please try again." }, { status: 500 });
      }
      await logAuditEvent(supabase, {
        schoolId,
        actorId: user.id,
        action: "student.bulk_import",
        targetType: "student",
        metadata: { count: toInsert.length },
      });
    }

    return Response.json({ results, insertedCount: toInsert.length });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function normalize(name: string) {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}
