import { z } from "zod";

export const VERIFICATION_PRIORITIES = ["low", "medium", "high"] as const;

/** "" (the picker's "Not assigned yet"/"Project-wide"/"No framework requirement" option) is
 *  treated as null, not a value to validate as a uuid. */
export const nullableUuid = z
  .union([z.string().uuid("Invalid selection."), z.literal("")])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

/**
 * Planning fields only (4A). Shared by create and update — 4A never edits result,
 * notes, verified_activity_id, verified_by or verified_at, so there is no separate
 * "execution" schema yet; that arrives with the Phase 4B execution mutation.
 */
export const verificationItemSchema = z.object({
  question: z.string().trim().min(1, "Check / Question is required."),
  priority: z.enum(VERIFICATION_PRIORITIES),
  siteId: nullableUuid,
  targetActivityId: nullableUuid,
  frameworkItemId: nullableUuid,
});

export type VerificationItemInput = z.infer<typeof verificationItemSchema>;

export const VERIFICATION_RESULTS = ["verified_ok", "issue_identified", "follow_up_required"] as const;

/**
 * Execution-only (Phase 4B): the fields recorded when a consultant verifies a check
 * onsite. Result is required — a pending item stays pending until an explicit result is
 * chosen (§15). Deliberately has no question/priority/site_id/target_activity_id/
 * framework_item_id — those are the 4A planning schema's job, never this one's.
 */
export const verificationExecutionSchema = z.object({
  result: z.enum(VERIFICATION_RESULTS),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type VerificationExecutionInput = z.infer<typeof verificationExecutionSchema>;
