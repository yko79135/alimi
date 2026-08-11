"use client";

import { useTransition } from "react";
import type { MembershipSummary } from "@/lib/tenant/active-school";
import { switchActiveSchool } from "./actions";

export function SchoolSwitcher({
  memberships,
  activeSchoolId,
}: {
  memberships: MembershipSummary[];
  activeSchoolId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={activeSchoolId}
      disabled={pending}
      onChange={(e) => startTransition(() => switchActiveSchool(e.target.value))}
      aria-label="Switch school"
      className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium text-ink"
    >
      {memberships.map((m) => (
        <option key={m.school.id} value={m.school.id}>
          {m.school.name}
        </option>
      ))}
    </select>
  );
}
