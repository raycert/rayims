import { z } from "zod";
import { PROJECT_STATUSES } from "@/lib/constants/values";

const dateField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * clientId is intentionally NOT part of this schema: it is always a trusted
 * route/prop value (BR-57 — the client is immutable after creation), never
 * taken from the form. siteIds/frameworkIds are checked for real membership
 * (belongs to this client / exists in the catalog) in the mutation, since a
 * client could submit ids that don't apply here.
 */
export const projectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required."),
  status: z.enum(PROJECT_STATUSES),
  startDate: dateField,
  endDate: dateField,
  siteIds: z.array(z.string().uuid()).default([]),
  frameworkIds: z.array(z.string().uuid()).default([]),
});

export type ProjectInput = z.infer<typeof projectSchema>;
