/**
 * Evidence file policy (Phase 4E). Shared by the browser (early feedback) and the server
 * (authoritative). An allowlist of practical consulting evidence types, checked by extension
 * and, when the browser supplies one, by MIME type. No executables or scripts.
 * The check itself lives in lib/files/policy (shared with Document Versions, Phase 5B).
 */
import { acceptAttribute, checkFile, FILE_TOO_LARGE, MAX_FILE_BYTES, OFFICE_AND_PDF_TYPES, type FilePolicy } from "@/lib/files/policy";

export const MAX_EVIDENCE_BYTES = MAX_FILE_BYTES;
export { FILE_TOO_LARGE };

export const UNSUPPORTED_TYPE =
  "This file type isn't supported. Use a photo (JPG, PNG, WebP), PDF, Word, Excel, PowerPoint or text file.";

export const EVIDENCE_POLICY: FilePolicy = {
  types: {
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    png: ["image/png"],
    webp: ["image/webp"],
    ...OFFICE_AND_PDF_TYPES,
    txt: ["text/plain"],
  },
  unsupportedMessage: UNSUPPORTED_TYPE,
  maxBytes: MAX_EVIDENCE_BYTES,
};

/** For the "Choose File" input. */
export const EVIDENCE_ACCEPT = acceptAttribute(EVIDENCE_POLICY);

export type EvidenceFileCheck = { ok: true; mimeType: string } | { ok: false; error: string };

export function checkEvidenceFile(file: { name: string; size: number; type: string }): EvidenceFileCheck {
  return checkFile(EVIDENCE_POLICY, file);
}

/** Images and PDFs can be viewed in the browser; everything else is downloaded. */
export function isViewableEvidence(mimeType: string | null): boolean {
  return !!mimeType && (mimeType.startsWith("image/") || mimeType === "application/pdf");
}
