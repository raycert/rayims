import { z } from "zod";

export const VERIFICATION_PRIORITIES = ["low", "medium", "high"] as const;

/** "" (the picker's "Not assigned yet"/"Project-wide"/"No framework requirement" option) is
 *  treated as null, not a value to validate as a uuid. */
const nullableUuid = z
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
