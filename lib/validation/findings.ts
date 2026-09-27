import { z } from "zod";
import { nullableUuid, VERIFICATION_PRIORITIES } from "./verification-items";

/** System-controlled closed set (ADR-018); mirrors the issues_finding_type_check constraint. */
export const FINDING_TYPES = ["nonconformity", "observation", "opportunity_for_improvement"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

/**
 * Core Finding fields only (Phase 4C-1). There is deliberately no status, verification_item_id,
 * document_review_id, correction, root_cause or effectiveness_* here: status starts Open on
 * create, origin links are set only from their real context, and the NC response fields are
 * Phase 4D. finding_type has no default — the user must choose it.
 */
export const findingSchema = z.object({
  findingType: z.enum(FINDING_TYPES, { error: "Select a Finding Type." }),
  title: z.string().trim().min(1, "Title is required."),
  description: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  priority: z.enum(VERIFICATION_PRIORITIES),
  siteId: nullableUuid,
  activityId: nullableUuid,
  frameworkItemId: nullableUuid,
});

export type FindingInput = z.infer<typeof findingSchema>;
