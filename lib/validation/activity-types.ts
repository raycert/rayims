import { z } from "zod";

/** Lowercase snake_case, matching the seeded values (e.g. "site_assessment"). */
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * key is CREATE-only (ADR-017 — stable after creation). The edit schema
 * intentionally has no key field at all, so a client can never smuggle a
 * changed key through the update action regardless of what the UI shows.
 */
export const activityTypeCreateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Key is required.")
    .regex(KEY_PATTERN, "Use lowercase letters, numbers and underscores only, e.g. site_assessment."),
  label: z.string().trim().min(1, "Label is required."),
  description: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  sortOrder: z.coerce.number().int("Sort order must be a whole number."),
  isActive: z.boolean(),
});

export const activityTypeUpdateSchema = z.object({
  label: z.string().trim().min(1, "Label is required."),
  description: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  sortOrder: z.coerce.number().int("Sort order must be a whole number."),
  isActive: z.boolean(),
});

export type ActivityTypeCreateInput = z.infer<typeof activityTypeCreateSchema>;
export type ActivityTypeUpdateInput = z.infer<typeof activityTypeUpdateSchema>;

/** Naive label -> key suggestion for the Create form. Admin reviews/edits before save. */
export function suggestKeyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
