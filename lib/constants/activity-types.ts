/**
 * Activity types are free text in the database and validated in the application
 * (ADR-012). Extend this list when a module needs new types.
 */
export const ACTIVITY_TYPES = [
  { value: "training", label: "Training" },
  { value: "site_assessment", label: "Site Assessment" },
  { value: "document_review", label: "Document Review" },
  { value: "document_support", label: "Document Support" },
  { value: "consulting", label: "Consulting" },
  { value: "online_support", label: "Online Support" },
  { value: "internal_audit", label: "Internal Audit" },
  { value: "follow_up", label: "Follow-up" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];
