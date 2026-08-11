// Hand-written to match supabase/migrations/*.sql. Regenerate with
// `supabase gen types typescript` once a live project exists, but keep
// hand-authored Enum/domain types in sync manually if you do.
//
// IMPORTANT: every Row shape below is a `type` alias, never an
// `interface`. @supabase/postgrest-js's query builder requires each
// table's Row/Insert/Update to satisfy a `Record<string, unknown>`
// generic constraint, and TypeScript's checker does not consider a bare
// `interface` (as opposed to an object-literal `type`) to satisfy that
// constraint — using `interface` here silently collapses every query's
// result type to `never` project-wide. This is easy to reintroduce by
// accident, so don't "clean up" these back to interfaces.

export type MembershipRole = "school_admin" | "teacher" | "parent";
export type MembershipStatus = "active" | "invited" | "deactivated";
export type SchoolStatus = "active" | "suspended";
export type StudentStatus = "active" | "inactive" | "archived";
export type TargetScope = "school" | "grade" | "homeroom" | "student";
export type AttendanceStatus = "present" | "late" | "absent" | "early_leave" | "excused";
export type BehaviorKind = "discipline" | "praise";
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";
export type SignupRequestStatus = "pending" | "approved" | "rejected" | "auto_approved";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "suspended";

type Timestamped = {
  created_at: string;
};

export type Profile = Timestamped & {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  locale: string;
  updated_at: string;
};

export type PlatformAdmin = {
  user_id: string;
  created_at: string;
  created_by: string | null;
};

export type School = Timestamped & {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
  logo_url: string | null;
  accent_color: string | null;
  timezone: string;
  locale: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: SchoolStatus;
  settings: Record<string, unknown>;
  created_by: string | null;
  updated_at: string;
};

export type SchoolMembership = Timestamped & {
  id: string;
  school_id: string;
  user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  invited_by: string | null;
  updated_at: string;
};

export type AcademicYear = Timestamped & {
  id: string;
  school_id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
};

export type GradeLevel = Timestamped & {
  id: string;
  school_id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export type Homeroom = Timestamped & {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  grade_level_id: string | null;
  name: string;
  homeroom_teacher_id: string | null;
  active: boolean;
};

export type Student = Timestamped & {
  id: string;
  school_id: string;
  name: string;
  grade_level_id: string | null;
  homeroom_id: string | null;
  student_number: string | null;
  status: StudentStatus;
  enrollment_date: string | null;
  verification_code: string;
  notes: string | null;
  updated_at: string;
};

export type GuardianStudent = Timestamped & {
  id: string;
  school_id: string;
  guardian_id: string;
  student_id: string;
  relationship: string | null;
};

export type StaffInvite = Timestamped & {
  id: string;
  school_id: string;
  email: string;
  role: "school_admin" | "teacher";
  token_hash: string;
  status: InviteStatus;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
};

export type ParentSignupLink = Timestamped & {
  id: string;
  school_id: string;
  token: string;
  label: string;
  grade_level_id: string | null;
  requires_approval: boolean;
  active: boolean;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  created_by: string | null;
};

export type ParentSignupRequest = Timestamped & {
  id: string;
  school_id: string;
  link_id: string | null;
  guardian_id: string;
  student_id: string | null;
  submitted_name: string;
  submitted_grade_level_id: string | null;
  relationship: string | null;
  status: SignupRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export type NoticeType = {
  id: string;
  school_id: string;
  key: string;
  label: string;
  color: string | null;
  is_positive: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
};

export type Notice = Timestamped & {
  id: string;
  school_id: string;
  notice_type_id: string | null;
  title: string;
  body: string;
  target_scope: TargetScope;
  target_grade_level_id: string | null;
  target_homeroom_id: string | null;
  requires_confirmation: boolean;
  created_by: string | null;
  published_at: string;
  updated_at: string;
};

export type NoticeStudent = {
  notice_id: string;
  student_id: string;
};

export type NoticeAttachment = {
  id: string;
  notice_id: string;
  school_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

export type Acknowledgement = {
  notice_id: string;
  guardian_id: string;
  school_id: string;
  read_at: string | null;
  confirmed_at: string | null;
  parent_reply: string | null;
  replied_at: string | null;
};

export type PushSubscription = Timestamped & {
  id: string;
  school_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  last_seen_at: string;
  failure_count: number;
};

export type GuardianDashboardEvent = Timestamped & {
  id: string;
  school_id: string;
  guardian_id: string;
  event_type: string;
  entity_id: string | null;
};

export type AttendanceChangeBatch = Timestamped & {
  id: string;
  school_id: string;
  idempotency_key: string;
  author_id: string | null;
};

export type AttendanceEntry = Timestamped & {
  id: string;
  school_id: string;
  student_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  previous_status: AttendanceStatus | null;
  change_type: "exception" | "correction";
  parent_visible_reason: string | null;
  teacher_note: string | null;
  batch_id: string | null;
  author_id: string | null;
};

export type BehaviorCategory = Timestamped & {
  id: string;
  school_id: string;
  key: string;
  label: string;
  kind: BehaviorKind;
  default_points: number;
  active: boolean;
  sort_order: number;
};

export type BehaviorChangeBatch = Timestamped & {
  id: string;
  school_id: string;
  idempotency_key: string;
  author_id: string | null;
};

export type BehaviorRecord = Timestamped & {
  id: string;
  school_id: string;
  student_id: string;
  category_id: string | null;
  kind: BehaviorKind;
  points: number;
  delta: number;
  change_type: "entry" | "correction" | "cancellation";
  occurred_on: string;
  reason: string;
  teacher_note: string | null;
  guardian_message: string | null;
  notice_id: string | null;
  batch_id: string | null;
  author_id: string | null;
};

export type AuditLog = Timestamped & {
  id: string;
  school_id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
};

export type Plan = {
  id: string;
  key: string;
  name: string;
  max_students: number | null;
  max_staff: number | null;
  max_storage_mb: number | null;
  features: Record<string, unknown>;
  monthly_price_cents: number | null;
  currency: string;
  active: boolean;
  created_at: string;
};

export type Subscription = Timestamped & {
  id: string;
  school_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  billing_provider: string;
  billing_provider_ref: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  updated_at: string;
};

// Matches @supabase/postgrest-js's GenericTable shape exactly (Row/
// Insert/Update/Relationships) so the client's query builder can infer
// real types instead of collapsing to `never`. Insert/Update are kept as
// Partial<Row> for simplicity — every field is technically optional at
// the type level even though the database enforces real NOT NULL/CHECK
// constraints at write time; regenerate with
// `supabase gen types typescript` for fully precise Insert/Update shapes
// once a live project exists.
//
// Row is intentionally the ONLY generic parameter (constrained to
// Record<string, unknown>) rather than also parameterizing Insert/Update
// with their own defaults — a default value that itself references a
// sibling type parameter (e.g. `Insert = Partial<Row>` as a second
// parameter) does not reliably satisfy downstream generic constraint
// checks in postgrest-js's query builder. Computing Insert/Update
// directly in the object body below avoids that.
type TableDef<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      platform_admins: TableDef<PlatformAdmin>;
      schools: TableDef<School>;
      school_memberships: TableDef<SchoolMembership>;
      academic_years: TableDef<AcademicYear>;
      grade_levels: TableDef<GradeLevel>;
      homerooms: TableDef<Homeroom>;
      students: TableDef<Student>;
      guardian_students: TableDef<GuardianStudent>;
      staff_invites: TableDef<StaffInvite>;
      parent_signup_links: TableDef<ParentSignupLink>;
      parent_signup_requests: TableDef<ParentSignupRequest>;
      notice_types: TableDef<NoticeType>;
      notices: TableDef<Notice>;
      notice_students: TableDef<NoticeStudent>;
      notice_attachments: TableDef<NoticeAttachment>;
      acknowledgements: TableDef<Acknowledgement>;
      push_subscriptions: TableDef<PushSubscription>;
      guardian_dashboard_events: TableDef<GuardianDashboardEvent>;
      attendance_change_batches: TableDef<AttendanceChangeBatch>;
      attendance_entries: TableDef<AttendanceEntry>;
      behavior_categories: TableDef<BehaviorCategory>;
      behavior_change_batches: TableDef<BehaviorChangeBatch>;
      behavior_records: TableDef<BehaviorRecord>;
      audit_logs: TableDef<AuditLog>;
      plans: TableDef<Plan>;
      subscriptions: TableDef<Subscription>;
    };
    Views: Record<string, never>;
    // Required by @supabase/postgrest-js's schema shape check even though
    // this project defines no composite types — omitting it makes every
    // query on this Database resolve to `never` under strictNullChecks.
    CompositeTypes: Record<string, never>;
    Functions: {
      create_school_with_admin: {
        Args: { p_name: string; p_slug: string; p_timezone?: string; p_locale?: string };
        Returns: School;
      };
      redeem_parent_signup_invite: {
        Args: { p_token: string; p_guardian_id: string; p_children: unknown };
        Returns: { school_id: string; results: { name: string; status: SignupRequestStatus }[] };
      };
      approve_parent_signup_request: {
        Args: { p_request_id: string };
        Returns: void;
      };
      guardian_attendance_entries: {
        Args: { p_student: string; p_from: string; p_to: string };
        Returns: Pick<
          AttendanceEntry,
          "id" | "student_id" | "attendance_date" | "status" | "previous_status" | "parent_visible_reason" | "created_at"
        >[];
      };
      guardian_behavior_records: {
        Args: { p_student: string; p_from: string; p_to: string };
        Returns: Pick<
          BehaviorRecord,
          "id" | "student_id" | "category_id" | "kind" | "points" | "occurred_on" | "reason" | "guardian_message" | "notice_id" | "created_at"
        >[];
      };
      attendance_current_status: {
        Args: { p_student: string; p_date: string };
        Returns: AttendanceStatus;
      };
      accept_school_invite: { Args: { p_school_id: string }; Returns: void };
      get_active_signup_link: {
        Args: { p_token: string };
        Returns: {
          school_id: string;
          school_name: string;
          school_logo_url: string | null;
          requires_approval: boolean;
          grade_level_id: string | null;
        }[];
      };
      get_school_grade_levels_public: {
        Args: { p_school_id: string };
        Returns: { id: string; name: string; sort_order: number }[];
      };
      is_platform_admin: { Args: Record<string, never>; Returns: boolean };
      is_school_admin: { Args: { target_school: string }; Returns: boolean };
      is_school_staff: { Args: { target_school: string }; Returns: boolean };
      is_school_member: { Args: { target_school: string }; Returns: boolean };
    };
    Enums: {
      membership_role: MembershipRole;
      membership_status: MembershipStatus;
      school_status: SchoolStatus;
      student_status: StudentStatus;
      target_scope: TargetScope;
      attendance_status: AttendanceStatus;
      behavior_kind: BehaviorKind;
      invite_status: InviteStatus;
      signup_request_status: SignupRequestStatus;
      subscription_status: SubscriptionStatus;
    };
  };
};
