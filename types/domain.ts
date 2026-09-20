import type {
  ACTION_STATUSES,
  ACTIVITY_MODES,
  ACTIVITY_STATUSES,
  CLIENT_STATUSES,
  DOCUMENT_DERIVED_STATUSES,
  ISSUE_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
  REVIEW_STATUSES,
  USER_ROLES,
  VERIFICATION_RESULTS,
} from "@/lib/constants/values";

type Values<T extends readonly string[]> = T[number];

export type UserRole = Values<typeof USER_ROLES>;
export type ClientStatus = Values<typeof CLIENT_STATUSES>;
export type ProjectStatus = Values<typeof PROJECT_STATUSES>;
export type ActivityStatus = Values<typeof ACTIVITY_STATUSES>;
export type ActivityMode = Values<typeof ACTIVITY_MODES>;
export type ReviewStatus = Values<typeof REVIEW_STATUSES>;
export type VerificationResult = Values<typeof VERIFICATION_RESULTS>;
export type IssueStatus = Values<typeof ISSUE_STATUSES>;
export type ActionStatus = Values<typeof ACTION_STATUSES>;
export type Priority = Values<typeof PRIORITIES>;
export type DocumentDerivedStatus = Values<typeof DOCUMENT_DERIVED_STATUSES>;
