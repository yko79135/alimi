import { requireSchoolStaff, authErrorResponse } from "@/lib/auth/require";
import { toCsv, csvResponse } from "@/lib/csv/stringify";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const schoolId = url.searchParams.get("schoolId");
    const from = url.searchParams.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
    if (!schoolId) return Response.json({ error: "schoolId is required" }, { status: 400 });

    const { supabase } = await requireSchoolStaff(schoolId);
    const { data } = await supabase
      .from("attendance_entries")
      .select("attendance_date, status, parent_visible_reason, student:students(name)")
      .eq("school_id", schoolId)
      .gte("attendance_date", from)
      .lte("attendance_date", to)
      .order("attendance_date", { ascending: false });

    const rows = (data ?? []).map((e) => [
      e.attendance_date,
      (e.student as unknown as { name: string } | null)?.name ?? "",
      e.status,
      e.parent_visible_reason,
    ]);

    const csv = toCsv(["date", "student", "status", "reason"], rows);
    return csvResponse(`attendance_${from}_${to}.csv`, csv);
  } catch (error) {
    return authErrorResponse(error);
  }
}
