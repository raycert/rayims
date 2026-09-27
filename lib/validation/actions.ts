import { z } from "zod";
import { nullableUuid, VERIFICATION_PRIORITIES } from "./verification-items";

/** Existing actions_status_check values. Effectiveness is never an action status (ADR-018). */
export const ACTION_STATUSES = ["open", "in_progress", "pending_review", "closed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/**
 * Core Action fields (Phase 4D-1). No status (a new action starts Open; status changes go
 * through setActionStatus), no issue_id / project_id (server-derived and immutable), no
 * completion fields (recorded when closing).
 */
export const actionSchema = z.object({
  description: z.string().trim().min(1, "Action is required."),
  ownerName: optionalText,
  dueDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."), z.literal("")])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  priority: z.enum(VERIFICATION_PRIORITIES),
  siteId: nullableUuid,
  activityId: nullableUuid,
});

export type ActionInput = z.infer<typeof actionSchema>;

export const actionStatusSchema = z.object({
  status: z.enum(ACTION_STATUSES, { error: "Select a status." }),
  /** Only used when moving to Closed; undefined = leave existing notes unchanged. */
  completionNotes: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null)),
});

/** NC response on a Nonconformity (issues.correction / issues.root_cause). Both optional. */
export const ncResponseSchema = z.object({
  correction: optionalText,
  rootCause: optionalText,
});

/** Current Effectiveness Review of a Nonconformity. Result required; "partially" etc. not allowed. */
export const effectivenessSchema = z.object({
  result: z.enum(["effective", "not_effective"], { error: "Select a result." }),
  notes: optionalText,
});
