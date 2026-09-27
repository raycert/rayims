/** One Evidence attachment as shown in the UI. No storage key, bucket or signed URL. */
export type EvidenceItem = {
  id: string;
  caption: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByName: string | null;
  uploadedAt: string;
};

/**
 * Embedded relationship used on every parent query (activities, verification_items, issues,
 * actions): the parent's attachments with their file metadata and uploader — no extra query and
 * no signed URL (URLs are generated only when the user clicks View / Download).
 */
export const EVIDENCE_EMBED =
  "attachments(id, caption, created_at, files(original_name, mime_type, size_bytes, created_at, profiles(display_name, email)))";

export type RawEvidence = {
  id: string;
  caption: string | null;
  created_at: string;
  files: {
    original_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
    profiles: { display_name: string | null; email: string | null } | null;
  } | null;
};

export function mapEvidence(rows: RawEvidence[] | null | undefined): EvidenceItem[] {
  return (rows ?? [])
    .filter((r) => r.files)
    .map((r) => ({
      id: r.id,
      caption: r.caption,
      fileName: r.files!.original_name,
      mimeType: r.files!.mime_type,
      sizeBytes: r.files!.size_bytes,
      uploadedByName: r.files!.profiles?.display_name ?? r.files!.profiles?.email ?? null,
      uploadedAt: r.created_at,
    }))
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : a.uploadedAt > b.uploadedAt ? 1 : a.id < b.id ? -1 : 1));
}
