/**
 * V1 value lists. Keep in sync with the CHECK constraints in
 * supabase/migrations and docs/03_DATABASE.md ("V1 value lists").
 */
export const USER_ROLES = ["admin", "consultant"] as const;
export const CLIENT_STATUSES = ["active", "inactive"] as const;
export const PROJECT_STATUSES = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "archived",
] as const;
export const ACTIVITY_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export const ACTIVITY_MODES = ["on_site", "online"] as const;
export const REVIEW_STATUSES = [
  "under_review",
  "revision_required",
  "accepted",
] as const;
export const VERIFICATION_RESULTS = [
  "verified_ok",
  "issue_identified",
  "follow_up_required",
] as const;
export const ISSUE_STATUSES = ["open", "closed"] as const;
export const ACTION_STATUSES = [
  "open",
  "in_progress",
  "pending_review",
  "closed",
] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;

/**
 * Document status is DERIVED (document_register view), never stored:
 * the three review statuses plus the derived-only values below.
 */
export const DOCUMENT_DERIVED_STATUSES = [
  "n_a",
  "not_received",
  "received",
  ...REVIEW_STATUSES,
] as const;
