/**
 * Evidence file policy (Phase 4E). Shared by the browser (early feedback) and the server
 * (authoritative). An allowlist of practical consulting evidence types, checked by extension
 * and, when the browser supplies one, by MIME type. No executables or scripts.
 */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024; // = the bucket's file_size_limit

const TYPES: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  txt: ["text/plain"],
};

/** For the "Choose File" input. */
export const EVIDENCE_ACCEPT = Object.keys(TYPES)
  .map((e) => `.${e}`)
  .join(",");

export const FILE_TOO_LARGE = "File must be 10 MB or smaller.";
export const UNSUPPORTED_TYPE =
  "This file type isn't supported. Use a photo (JPG, PNG, WebP), PDF, Word, Excel, PowerPoint or text file.";

export type EvidenceFileCheck = { ok: true; mimeType: string } | { ok: false; error: string };

export function checkEvidenceFile(file: { name: string; size: number; type: string }): EvidenceFileCheck {
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  const allowed = TYPES[ext];
  if (!allowed) return { ok: false, error: UNSUPPORTED_TYPE };
  const declared = (file.type ?? "").toLowerCase();
  // Some mobile browsers send no type (or a generic one) for Office files: rely on the extension then.
  if (declared && declared !== "application/octet-stream" && !allowed.includes(declared)) {
    return { ok: false, error: UNSUPPORTED_TYPE };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: "The file is empty." };
  if (file.size > MAX_EVIDENCE_BYTES) return { ok: false, error: FILE_TOO_LARGE };
  return { ok: true, mimeType: allowed[0] };
}

/** Images and PDFs can be viewed in the browser; everything else is downloaded. */
export function isViewableEvidence(mimeType: string | null): boolean {
  return !!mimeType && (mimeType.startsWith("image/") || mimeType === "application/pdf");
}
