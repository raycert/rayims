export type Tone = "success" | "warning" | "danger" | "neutral";

export function clientStatusLabel(status: string): string {
  return status === "active" ? "Active" : "Inactive";
}
export function clientStatusTone(status: string): Tone {
  return status === "active" ? "success" : "neutral";
}

/** For real `is_active boolean` columns (e.g. activity_types), not a text status. */
export function activeStatusLabel(isActive: boolean): string {
  return isActive ? "Active" : "Inactive";
}
export function activeStatusTone(isActive: boolean): Tone {
  return isActive ? "success" : "neutral";
}

const PROJECT_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
};
const PROJECT_TONES: Record<string, Tone> = {
  planning: "neutral",
  active: "success",
  on_hold: "warning",
  completed: "success",
  archived: "neutral",
};

/** Falls back to the raw value for a status not yet in the map (forward-compatible). */
export function projectStatusLabel(status: string): string {
  return PROJECT_LABELS[status] ?? status;
}
export function projectStatusTone(status: string): Tone {
  return PROJECT_TONES[status] ?? "neutral";
}

const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const ACTIVITY_STATUS_TONES: Record<string, Tone> = {
  planned: "neutral",
  in_progress: "success",
  completed: "success",
  cancelled: "neutral",
};

export function activityStatusLabel(status: string): string {
  return ACTIVITY_STATUS_LABELS[status] ?? status;
}
export function activityStatusTone(status: string): Tone {
  return ACTIVITY_STATUS_TONES[status] ?? "neutral";
}

/** Shared low/medium/high vocabulary (verification_items, issues, actions). */
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
const PRIORITY_TONES: Record<string, Tone> = { low: "neutral", medium: "warning", high: "danger" };

export function priorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority;
}
export function priorityTone(priority: string): Tone {
  return PRIORITY_TONES[priority] ?? "neutral";
}

/** Finding = the `issues` table (ADR-018). Type is a closed system set. */
const FINDING_TYPE_LABELS: Record<string, string> = {
  nonconformity: "Nonconformity",
  observation: "Observation",
  opportunity_for_improvement: "Opportunity for Improvement",
};
const FINDING_TYPE_TONES: Record<string, Tone> = {
  nonconformity: "danger",
  observation: "warning",
  opportunity_for_improvement: "neutral",
};

export function findingTypeLabel(type: string): string {
  return FINDING_TYPE_LABELS[type] ?? type;
}
export function findingTypeTone(type: string): Tone {
  return FINDING_TYPE_TONES[type] ?? "neutral";
}

export function findingStatusLabel(status: string): string {
  return status === "closed" ? "Closed" : "Open";
}
export function findingStatusTone(status: string): Tone {
  return status === "closed" ? "success" : "warning";
}

const ACTION_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  pending_review: "Pending Review",
  closed: "Closed",
};
const ACTION_STATUS_TONES: Record<string, Tone> = {
  open: "neutral",
  in_progress: "warning",
  pending_review: "warning",
  closed: "success",
};

export function actionStatusLabel(status: string): string {
  return ACTION_STATUS_LABELS[status] ?? status;
}
export function actionStatusTone(status: string): Tone {
  return ACTION_STATUS_TONES[status] ?? "neutral";
}

/** null = Pending (not yet verified) — never rendered as a raw null/blank. */
const VERIFICATION_RESULT_LABELS: Record<string, string> = {
  verified_ok: "Verified OK",
  issue_identified: "Issue Identified",
  follow_up_required: "Follow-up Required",
};
const VERIFICATION_RESULT_TONES: Record<string, Tone> = {
  verified_ok: "success",
  issue_identified: "danger",
  follow_up_required: "warning",
};

export function verificationResultLabel(result: string | null): string {
  if (!result) return "Pending";
  return VERIFICATION_RESULT_LABELS[result] ?? result;
}
export function verificationResultTone(result: string | null): Tone {
  if (!result) return "neutral";
  return VERIFICATION_RESULT_TONES[result] ?? "neutral";
}

/** Effectiveness Review (Nonconformity). null = Not Reviewed. */
export function effectivenessLabel(result: string | null): string {
  if (result === "effective") return "Effective";
  if (result === "not_effective") return "Not Effective";
  return "Not Reviewed";
}
export function effectivenessTone(result: string | null): Tone {
  if (result === "effective") return "success";
  if (result === "not_effective") return "danger";
  return "neutral";
}
