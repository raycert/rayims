"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { buildStorageKey, getStorage } from "@/lib/storage";
import { FILE_TOO_LARGE, MAX_FILE_BYTES } from "@/lib/files/policy";
import {
  createFileSignedUrl,
  discardUnregisteredObject,
  FILE_UNAVAILABLE,
  insertFileRow,
  isKeyRegistered,
  isProjectStorageKey,
  removeStoredObject,
  storedObjectSize,
} from "@/lib/files/server";
import { checkDocumentVersionFile, documentVersionMetaSchema } from "@/lib/validation/document-versions";
import { evaluateVersionDelete, type DeleteEvaluation } from "@/lib/domain/delete-rules";
import type { SupabaseServerClient } from "./scope-validation";
import { fieldErrorsFrom, type ActionResult } from "./types";

const NOT_APPLICABLE = "Versions cannot be uploaded while this document is Not Applicable.";
const NOT_FOUND = "This document could not be found.";
const RACE = "Another version was uploaded at the same time. Please try again.";

type FileMeta = { name: string; size: number; type: string };

function revalidateDocument(projectId: string, documentId: string) {
  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
}

/** The Document must exist and belong to projectId (document_versions has no project_id). */
async function loadDocument(supabase: SupabaseServerClient, projectId: string, documentId: string) {
  const { data, error } = await supabase.from("documents").select("id, project_id, is_applicable").eq("id", documentId).maybeSingle();
  if (error) return { ok: false as const, error: "Couldn't load the document. Try again." };
  if (!data || data.project_id !== projectId) return { ok: false as const, error: NOT_FOUND };
  return { ok: true as const, applicable: data.is_applicable };
}

function meta(file: unknown): FileMeta {
  const f = (file ?? {}) as Partial<FileMeta>;
  return { name: String(f.name ?? ""), size: Number(f.size), type: String(f.type ?? "") };
}

/**
 * Step 1 of a Version upload (Phase 5B): validate the Document (this project, Applicable) and the
 * file policy, then return a server-generated storage key. No database row is created here; the
 * browser uploads the bytes directly to the private bucket and then calls registerDocumentVersion.
 */
export async function prepareDocumentVersionUpload(
  projectId: string,
  documentId: string,
  file: unknown,
): Promise<ActionResult<{ storageKey: string; contentType: string }>> {
  await requireUser();
  const m = meta(file);
  const policy = checkDocumentVersionFile(m);
  if (!policy.ok) return { ok: false, error: policy.error };

  const supabase = await createSupabaseClient();
  const doc = await loadDocument(supabase, projectId, documentId);
  if (!doc.ok) return { ok: false, error: doc.error };
  if (!doc.applicable) return { ok: false, error: NOT_APPLICABLE };

  return { ok: true, data: { storageKey: buildStorageKey(projectId, m.name), contentType: policy.mimeType } };
}

async function nextVersionNo(supabase: SupabaseServerClient, documentId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("version_no")
    .eq("document_id", documentId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data?.version_no ?? 0) + 1;
}

/**
 * Step 2: register the uploaded object as the next Version. Everything is re-validated (key shape
 * and project prefix, Document + project + Applicable, file policy, the object's REAL stored size).
 * Then one `files` row and one `document_versions` row with version_no = max + 1 (server-assigned;
 * a lost race on UNIQUE (document_id, version_no) is retried once). uploaded_by / created_at are
 * server-derived. Cleanup: any failure after the upload removes the object (never one already
 * registered); a failed version insert also removes the new `files` row.
 */
export async function registerDocumentVersion(
  projectId: string,
  documentId: string,
  input: unknown,
): Promise<ActionResult<{ versionNo: number }>> {
  const user = await requireUser();
  const supabase = await createSupabaseClient();
  const storage = getStorage(supabase);
  const raw = (input ?? {}) as Record<string, unknown>;
  const key = String(raw.storageKey ?? "");
  if (!isProjectStorageKey(projectId, key)) return { ok: false, error: "The upload could not be registered. Try again." };
  const discard = () => discardUnregisteredObject(supabase, storage, key);

  const existing = await isKeyRegistered(supabase, key);
  if (existing === null) return { ok: false, error: "The upload could not be registered. Try again." };
  if (existing) return { ok: false, error: "This upload was already registered." };

  const parsed = documentVersionMetaSchema.safeParse({ revision: raw.revision, receivedOn: raw.receivedOn, notes: raw.notes });
  if (!parsed.success) {
    await discard();
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const m = meta(raw);
  const policy = checkDocumentVersionFile(m);
  if (!policy.ok) {
    await discard();
    return { ok: false, error: policy.error };
  }
  const doc = await loadDocument(supabase, projectId, documentId);
  if (!doc.ok || !doc.applicable) {
    await discard();
    return { ok: false, error: doc.ok ? NOT_APPLICABLE : doc.error };
  }

  const size = await storedObjectSize(storage, key, m.size);
  if (size === null) return { ok: false, error: "The upload did not complete. Try again." };
  if (size > MAX_FILE_BYTES) {
    await discard();
    return { ok: false, error: FILE_TOO_LARGE };
  }

  const file = await insertFileRow(supabase, {
    projectId,
    provider: storage.name,
    key,
    originalName: m.name,
    mimeType: policy.mimeType,
    size,
    uploadedBy: user.id,
  });
  if (!file) {
    await discard();
    return { ok: false, error: "The file could not be saved. Try again." };
  }

  let versionNo: number | null = null;
  let raced = false;
  for (let attempt = 0; attempt < 2 && versionNo === null; attempt += 1) {
    const next = await nextVersionNo(supabase, documentId);
    if (next === null) break;
    const { error } = await supabase.from("document_versions").insert({
      document_id: documentId,
      version_no: next,
      revision: parsed.data.revision,
      received_on: parsed.data.receivedOn,
      notes: parsed.data.notes,
      file_id: file.id,
      uploaded_by: user.id,
    });
    if (!error) versionNo = next;
    else if (error.code === "23505") raced = true;
    else break;
  }
  if (versionNo === null) {
    await supabase.from("files").delete().eq("id", file.id);
    await discard();
    return { ok: false, error: raced ? RACE : "The version could not be saved. Try again." };
  }

  revalidateDocument(projectId, documentId);
  return { ok: true, data: { versionNo } };
}

type LoadedVersion = {
  ok: true;
  documentId: string;
  fileId: string;
  storageKey: string;
  originalName: string;
  evaluation: DeleteEvaluation;
};

/**
 * Loads a Version with its Document and file, enforcing Version → Document → project AND
 * files.project_id = the Document's project (tampered cross-project ids are "not found").
 */
async function loadVersion(
  supabase: SupabaseServerClient,
  projectId: string,
  versionId: string,
): Promise<LoadedVersion | { ok: false; error: string }> {
  const notFound = { ok: false as const, error: "This version could not be found." };
  const { data, error } = await supabase
    .from("document_versions")
    .select("id, document_id, version_no, file_id, documents(project_id, is_applicable), files(id, storage_key, original_name, project_id), document_reviews(count)")
    .eq("id", versionId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't load the version. Try again." };
  if (!data || !data.documents || data.documents.project_id !== projectId || !data.files || data.files.project_id !== projectId) return notFound;

  const { data: latest, error: latestError } = await supabase
    .from("document_versions")
    .select("version_no")
    .eq("document_id", data.document_id)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError || !latest) return { ok: false, error: "Couldn't load the version. Try again." };

  return {
    ok: true,
    documentId: data.document_id,
    fileId: data.file_id,
    storageKey: data.files.storage_key,
    originalName: data.files.original_name,
    evaluation: evaluateVersionDelete({
      isLatest: data.version_no === latest.version_no,
      reviewCount: data.document_reviews[0]?.count ?? 0,
      documentApplicable: data.documents.is_applicable,
    }),
  };
}

/** Signed URL (60 s) for View / Download, generated on click only; "File is unavailable." when missing. */
export async function getDocumentVersionUrl(
  projectId: string,
  versionId: string,
  mode: "view" | "download",
): Promise<ActionResult<{ url: string }>> {
  await requireUser();
  const supabase = await createSupabaseClient();
  const v = await loadVersion(supabase, projectId, versionId);
  if (!v.ok) return { ok: false, error: FILE_UNAVAILABLE };
  const url = await createFileSignedUrl(getStorage(supabase), v.storageKey, v.originalName, mode === "download" ? "download" : "view");
  return url ? { ok: true, data: { url } } : { ok: false, error: FILE_UNAVAILABLE };
}

/** Whether a Version may be deleted, with every blocker (read-only; delete re-checks). */
export async function getDocumentVersionDeleteState(projectId: string, versionId: string): Promise<ActionResult<DeleteEvaluation>> {
  await requireUser();
  const supabase = await createSupabaseClient();
  const v = await loadVersion(supabase, projectId, versionId);
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, data: v.evaluation };
}

/**
 * Controlled Version delete (Phase 5B): only the latest, unreviewed Version of an Applicable
 * Document. Order (FK-safe, least inconsistent): delete the version row → delete its `files` row
 * (only if nothing else references it) → remove the stored object. A Storage failure is reported
 * (the object is an orphan found by its project prefix) — business rows are never recreated.
 * The Document, its mappings and older Versions are untouched; nothing is renumbered.
 */
export async function deleteDocumentVersion(
  projectId: string,
  versionId: string,
): Promise<ActionResult<DeleteEvaluation & { storedFileRemoved: boolean }>> {
  await requireUser();
  const supabase = await createSupabaseClient();
  const v = await loadVersion(supabase, projectId, versionId);
  if (!v.ok) return { ok: false, error: v.error };
  if (!v.evaluation.canDelete) return { ok: false, error: v.evaluation.blockers.join(" ") };

  const { data, error } = await supabase.from("document_versions").delete().eq("id", versionId).eq("document_id", v.documentId).select("id");
  if (error) return { ok: false, error: "Couldn't delete the version. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This version could not be deleted. It may have been changed." };

  let storedFileRemoved = false;
  const [otherAttachments, otherVersions] = await Promise.all([
    supabase.from("attachments").select("id", { count: "exact", head: true }).eq("file_id", v.fileId),
    supabase.from("document_versions").select("id", { count: "exact", head: true }).eq("file_id", v.fileId),
  ]);
  if (!otherAttachments.error && !otherVersions.error && (otherAttachments.count ?? 0) === 0 && (otherVersions.count ?? 0) === 0) {
    const { error: fileError } = await supabase.from("files").delete().eq("id", v.fileId).eq("project_id", projectId);
    if (!fileError) storedFileRemoved = await removeStoredObject(getStorage(supabase), v.storageKey);
  }

  revalidateDocument(projectId, v.documentId);
  return { ok: true, data: { ...v.evaluation, storedFileRemoved } };
}
