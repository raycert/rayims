import { z } from "zod";
import { nullableUuid } from "./verification-items";

const optionalText = z
  .string()
  .trim()
  .max(200, "Keep this under 200 characters.")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** Expected Records / Required Evidence (Phase 7D, ADR-022): application cap, enforced here and by the import. */
export const EXPECTED_RECORDS_MAX = 2000;
export const EXPECTED_RECORDS_TOO_LONG = "Keep Expected Records under 2,000 characters.";

/** One line-ending convention (\n); stored text otherwise keeps the consultant's / client's exact wording. */
export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/** Trimmed, line breaks preserved (as \n); nothing (or only whitespace) → null. Lines are never reordered or split. */
export function normalizeExpectedRecords(value: string | null | undefined): string | null {
  const text = normalizeLineEndings(value ?? "").trim();
  return text === "" ? null : text;
}

const expectedRecordsText = z
  .string()
  .optional()
  .nullable()
  .transform((v) => normalizeExpectedRecords(v))
  .refine((v) => v === null || v.length <= EXPECTED_RECORDS_MAX, EXPECTED_RECORDS_TOO_LONG);

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
  expectedRecords: expectedRecordsText,
  siteId: nullableUuid,
  isApplicable: z.boolean(),
  frameworkItemIds: z
    .array(z.string().uuid("Invalid framework requirement."))
    .max(300, "Too many framework requirements.")
    .default([])
    .transform((ids) => [...new Set(ids)]),
});

export type DocumentInput = z.infer<typeof documentSchema>;
