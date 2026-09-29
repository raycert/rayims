/**
 * Neutral file-type / size policy (shared by Evidence and Document Versions, Phase 5B). Each
 * purpose defines its own allowlist; the check itself is identical everywhere: extension first,
 * then the browser's MIME type when it sends a specific one. Used in the browser (early feedback)
 * and on the server (authoritative); the bucket limit is the final backstop.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // = the rayims-files bucket's file_size_limit
export const FILE_TOO_LARGE = "File must be 10 MB or smaller.";

export type FilePolicy = {
  /** extension (lower case, no dot) -> accepted MIME types; the first is stored */
  types: Record<string, string[]>;
  unsupportedMessage: string;
  maxBytes: number;
};

export type FileCheck = { ok: true; mimeType: string } | { ok: false; error: string };

export function checkFile(policy: FilePolicy, file: { name: string; size: number; type: string }): FileCheck {
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  const allowed = policy.types[ext];
  if (!allowed) return { ok: false, error: policy.unsupportedMessage };
  const declared = (file.type ?? "").toLowerCase();
  // Some mobile browsers send no type (or a generic one) for Office files: rely on the extension then.
  if (declared && declared !== "application/octet-stream" && !allowed.includes(declared)) {
    return { ok: false, error: policy.unsupportedMessage };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: "The file is empty." };
  if (file.size > policy.maxBytes) return { ok: false, error: FILE_TOO_LARGE };
  return { ok: true, mimeType: allowed[0] };
}

/** Value for an <input type="file" accept>. */
export function acceptAttribute(policy: FilePolicy): string {
  return Object.keys(policy.types)
    .map((e) => `.${e}`)
    .join(",");
}

/** Office / PDF MIME types shared by several policies. */
export const OFFICE_AND_PDF_TYPES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
};
