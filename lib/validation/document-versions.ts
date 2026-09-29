import { z } from "zod";
import { acceptAttribute, checkFile, MAX_FILE_BYTES, OFFICE_AND_PDF_TYPES, type FileCheck, type FilePolicy } from "@/lib/files/policy";

/**
 * Document Version file policy (Phase 5B): controlled documents arrive as PDF or Office files
 * (scans as PDF). No images, no plain text. 10 MB (the bucket limit).
 */
export const DOCUMENT_VERSION_POLICY: FilePolicy = {
  types: OFFICE_AND_PDF_TYPES,
  unsupportedMessage: "This file type isn't supported for document versions. Use PDF, Word, Excel or PowerPoint.",
  maxBytes: MAX_FILE_BYTES,
};

export const DOCUMENT_VERSION_ACCEPT = acceptAttribute(DOCUMENT_VERSION_POLICY);

export function checkDocumentVersionFile(file: { name: string; size: number; type: string }): FileCheck {
  return checkFile(DOCUMENT_VERSION_POLICY, file);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/**
 * The metadata a user may give a new Version. version_no, file, uploaded_by and created_at are
 * always server-derived; a Version is immutable once created (no edit schema exists).
 */
export const documentVersionMetaSchema = z.object({
  revision: optionalText(100),
  receivedOn: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."), z.literal("")])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "Enter a valid date."),
  notes: optionalText(2000),
});

export type DocumentVersionMeta = z.infer<typeof documentVersionMetaSchema>;
