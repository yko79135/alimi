import { requireSchoolStaff, authErrorResponse } from "@/lib/auth/require";
import { toCsv, csvResponse } from "@/lib/csv/stringify";

export async function GET(request: Request) {
  try {
    const schoolId = new URL(request.url).searchParams.get("schoolId");
    if (!schoolId) return Response.json({ error: "schoolId is required" }, { status: 400 });

    const { supabase } = await requireSchoolStaff(schoolId);
    const { data: students } = await supabase
      .from("students")
      .select("name, student_number, status, enrollment_date, grade_level:grade_levels(name), homeroom:homerooms(name)")
      .eq("school_id", schoolId)
      .order("name");

    const rows = (students ?? []).map((s) => [
      s.name,
      s.student_number,
      (s.grade_level as unknown as { name: string } | null)?.name ?? "",
      (s.homeroom as unknown as { name: string } | null)?.name ?? "",
      s.status,
      s.enrollment_date,
    ]);

    const csv = toCsv(["name", "student_number", "grade", "homeroom", "status", "enrollment_date"], rows);
    return csvResponse("students.csv", csv);
  } catch (error) {
    return authErrorResponse(error);
  }
}
