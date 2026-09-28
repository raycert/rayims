import { z } from "zod";
import { nullableUuid } from "./verification-items";

const optionalText = z
  .string()
  .trim()
  .max(200, "Keep this under 200 characters.")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/**
 * Document identity (Phase 5A). A Document is the LOGICAL controlled document, not a file:
 * there is deliberately no status (derived, ADR-005), version, file or review field here.
 * project_id and created_by are never accepted from the client. Framework mappings are the
 * complete desired set; the server diffs it against the stored set.
 */
export const documentSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(300, "Keep the title under 300 characters."),
  docCode: optionalText,
  documentType: optionalText,
  ownerName: optionalText,
  siteId: nullableUuid,
  isApplicable: z.boolean(),
  frameworkItemIds: z
    .array(z.string().uuid("Invalid framework requirement."))
    .max(300, "Too many framework requirements.")
    .default([])
    .transform((ids) => [...new Set(ids)]),
});

export type DocumentInput = z.infer<typeof documentSchema>;
