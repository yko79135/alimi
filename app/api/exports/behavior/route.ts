import { requireSchoolStaff, authErrorResponse } from "@/lib/auth/require";
import { toCsv, csvResponse } from "@/lib/csv/stringify";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const schoolId = url.searchParams.get("schoolId");
    if (!schoolId) return Response.json({ error: "schoolId is required" }, { status: 400 });

    const { supabase } = await requireSchoolStaff(schoolId);
    const { data } = await supabase
      .from("behavior_records")
      .select("occurred_on, kind, points, reason, student:students(name)")
      .eq("school_id", schoolId)
      .order("occurred_on", { ascending: false })
      .limit(5000);

    const rows = (data ?? []).map((r) => [
      r.occurred_on,
      (r.student as unknown as { name: string } | null)?.name ?? "",
      r.kind,
      r.points,
      r.reason,
    ]);

    const csv = toCsv(["date", "student", "kind", "points", "reason"], rows);
    return csvResponse("behavior.csv", csv);
  } catch (error) {
    return authErrorResponse(error);
  }
}
