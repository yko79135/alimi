import { redirect } from "next/navigation";
import { getActiveSchoolContext } from "@/lib/tenant/active-school";

export default async function AppIndexPage() {
  const ctx = await getActiveSchoolContext();
  const isStaff = ctx.activeRoles.includes("school_admin") || ctx.activeRoles.includes("teacher");
  redirect(isStaff ? "/app/dashboard" : "/app/family");
}
