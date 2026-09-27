"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { buildStorageKey, getStorage } from "@/lib/storage";
import { checkEvidenceFile, MAX_EVIDENCE_BYTES, FILE_TOO_LARGE } from "@/lib/validation/evidence";
import type { SupabaseServerClient } from "./scope-validation";
import type { ActionResult } from "./types";

/** The record an attachment belongs to — one of the explicit attachments FKs (ADR-009). */
export type EvidenceParent = { kind: "activity" | "verification" | "finding" | "action"; id: string };

const PARENT_COLUMN = {
  activity: "activity_id",
  verification: "verification_item_id",
  finding: "issue_id",
  action: "action_id",
} as const;

const SIGNED_URL_SECONDS = 60;
const UNAVAILABLE = "File is unavailable.";

type ParentCheck = { ok: true; editable: boolean; lockedReason: string | null; activityId: string | null } | { ok: false; error: string };

/**
 * Loads the parent and checks it belongs to projectId. Editability (Phase 4E): an Activity or a
 * Verification item is always editable; a Finding only while Open; an Action only while not
 * Closed and while its Finding (if any) is Open (BR-97).
 */
async function checkParent(supabase: SupabaseServerClient, projectId: string, parent: EvidenceParent): Promise<ParentCheck> {
  const notFound: ParentCheck = { ok: false, error: "This record could not be found." };
  if (parent.kind === "activity") {
    const { data, error } = await supabase.from("activities").select("id, project_id").eq("id", parent.id).maybeSingle();
    if (error || !data || data.project_id !== projectId) return notFound;
    return { ok: true, editable: true, lockedReason: null, activityId: data.id };
  }
  if (parent.kind === "verification") {
    const { data, error } = await supabase
      .from("verification_items")
      .select("id, project_id, target_activity_id, verified_activity_id")
      .eq("id", parent.id)
      .maybeSingle();
    if (error || !data || data.project_id !== projectId) return notFound;
    return { ok: true, editable: true, lockedReason: null, activityId: data.verified_activity_id ?? data.target_activity_id };
  }
  if (parent.kind === "finding") {
    const { data, error } = await supabase.from("issues").select("id, project_id, status").eq("id", parent.id).maybeSingle();
    if (error || !data || data.project_id !== projectId) return notFound;
    const open = data.status !== "closed";
    return { ok: true, editable: open, lockedReason: open ? null : "This finding is closed. Reopen it to change its evidence.", activityId: null };
  }
  if (parent.kind === "action") {
    const { data, error } = await supabase
      .from("actions")
      .select("id, project_id, status, issue_id, issues(status)")
      .eq("id", parent.id)
      .maybeSingle();
    if (error || !data || data.project_id !== projectId) return notFound;
    if (data.issues?.status === "closed") {
      return { ok: true, editable: false, lockedReason: "The finding is closed. Reopen it to change this action's evidence.", activityId: null };
    }
    if (data.status === "closed") {
      return { ok: true, editable: false, lockedReason: "This action is closed. Reopen it to change its evidence.", activityId: null };
    }
    return { ok: true, editable: true, lockedReason: null, activityId: null };
  }
  return notFound;
}

function isParent(value: unknown): value is EvidenceParent {
  const p = value as EvidenceParent;
  return !!p && typeof p.id === "string" && /^[0-9a-f-]{36}$/i.test(p.id) && p.kind in PARENT_COLUMN;
}

function revalidateParent(projectId: string, parent: EvidenceParent, activityId: string | null) {
  if (parent.kind === "finding") revalidatePath(`/projects/${projectId}/findings/${parent.id}`);
  if (parent.kind === "action") {
    revalidatePath(`/projects/${projectId}/actions`);
    revalidatePath(`/projects/${projectId}/findings`, "layout");
  }
  if (activityId) revalidatePath(`/projects/${projectId}/activities/${activityId}`);
}

/**
 * Step 1 of an upload: validate the parent (exists, in this project, editable) and the file
 * policy, then return a server-generated, collision-resistant storage key. The browser then
 * uploads the bytes directly to the private bucket under its own session (the approved flow —
 * files are larger than a Server Action body) and calls registerEvidence.
 */
export async function prepareEvidenceUpload(
  projectId: string,
  parent: unknown,
  file: { name: string; size: number; type: string },
): Promise<ActionResult<{ storageKey: string; contentType: string }>> {
  await requireUser();
  if (!isParent(parent)) return { ok: false, error: "This record could not be found." };
  const policy = checkEvidenceFile({ name: String(file?.name ?? ""), size: Number(file?.size), type: String(file?.type ?? "") });
  if (!policy.ok) return { ok: false, error: policy.error };

  const supabase = await createSupabaseClient();
  const check = await checkParent(supabase, projectId, parent);
  if (!check.ok) return { ok: false, error: check.error };
  if (!check.editable) return { ok: false, error: check.lockedReason ?? "Evidence can't be changed here." };

  return { ok: true, data: { storageKey: buildStorageKey(projectId, file.name), contentType: policy.mimeType } };
}

/**
 * Step 2: register an uploaded object as Evidence. Everything is re-validated (parent, project,
 * editability, policy, key shape, the object's real size). Then one `files` row and one
 * `attachments` row with exactly one parent FK. Cleanup: if anything fails after the upload, the
 * object is removed (best effort); if the attachment insert fails, the files row is removed too.
 */
export async function registerEvidence(
  projectId: string,
  parent: unknown,
  input: { storageKey: string; name: string; size: number; type: string; caption?: string | null },
): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseClient();
  const storage = getStorage(supabase);
  const key = String(input?.storageKey ?? "");
  const keyValid = key.startsWith(`${projectId}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}-[A-Za-z0-9._-]+$/i.test(key);
  if (!keyValid) return { ok: false, error: "The upload could not be registered. Try again." };

  // Removes the just-uploaded object — but NEVER an object already registered in `files` (a
  // re-sent or foreign key must not delete someone else's evidence).
  const discard = async () => {
    try {
      const { data: registered } = await supabase.from("files").select("id").eq("storage_key", key).maybeSingle();
      if (registered) return;
      await storage.remove([key]);
    } catch {
      // Best effort: an unreferenced object is found later by its project prefix (manual cleanup).
    }
  };

  const { data: existing, error: existingError } = await supabase.from("files").select("id").eq("storage_key", key).maybeSingle();
  if (existingError) return { ok: false, error: "The upload could not be registered. Try again." };
  if (existing) return { ok: false, error: "This upload was already registered." };

  if (!isParent(parent)) {
    await discard();
    return { ok: false, error: "This record could not be found." };
  }
  const policy = checkEvidenceFile({ name: String(input.name ?? ""), size: Number(input.size), type: String(input.type ?? "") });
  if (!policy.ok) {
    await discard();
    return { ok: false, error: policy.error };
  }
  const check = await checkParent(supabase, projectId, parent);
  if (!check.ok || !check.editable) {
    await discard();
    return { ok: false, error: check.ok ? (check.lockedReason ?? "Evidence can't be changed here.") : check.error };
  }

  const stat = await storage.stat(key);
  if (!stat) return { ok: false, error: "The upload did not complete. Try again." };
  const size = stat.size ?? Number(input.size);
  if (size > MAX_EVIDENCE_BYTES) {
    await discard();
    return { ok: false, error: FILE_TOO_LARGE };
  }

  const caption = typeof input.caption === "string" && input.caption.trim() ? input.caption.trim() : null;

  const { data: file, error: fileError } = await supabase
    .from("files")
    .insert({
      project_id: projectId,
      storage_provider: storage.name,
      storage_key: key,
      original_name: input.name.slice(0, 255),
      mime_type: policy.mimeType,
      size_bytes: size,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (fileError || !file) {
    await discard();
    return { ok: false, error: "The file could not be saved. Try again." };
  }

  // Exactly one parent FK is set (attachments_exactly_one_parent enforces it in the database).
  const { error: attachError } = await supabase.from("attachments").insert({
    project_id: projectId,
    file_id: file.id,
    caption,
    activity_id: parent.kind === "activity" ? parent.id : null,
    verification_item_id: parent.kind === "verification" ? parent.id : null,
    issue_id: parent.kind === "finding" ? parent.id : null,
    action_id: parent.kind === "action" ? parent.id : null,
    created_by: user.id,
  });
  if (attachError) {
    await supabase.from("files").delete().eq("id", file.id);
    await discard();
    return { ok: false, error: "The file could not be saved. Try again." };
  }

  revalidateParent(projectId, parent, check.activityId);
  return { ok: true, data: undefined };
}

type LoadedAttachment = {
  id: string;
  project_id: string;
  file_id: string;
  activity_id: string | null;
  verification_item_id: string | null;
  issue_id: string | null;
  action_id: string | null;
  document_review_id: string | null;
  files: { id: string; storage_key: string; original_name: string; project_id: string } | null;
};

function parentOf(a: LoadedAttachment): EvidenceParent | null {
  if (a.activity_id) return { kind: "activity", id: a.activity_id };
  if (a.verification_item_id) return { kind: "verification", id: a.verification_item_id };
  if (a.issue_id) return { kind: "finding", id: a.issue_id };
  if (a.action_id) return { kind: "action", id: a.action_id };
  return null;
}

async function loadAttachment(supabase: SupabaseServerClient, projectId: string, attachmentId: string) {
  const { data, error } = await supabase
    .from("attachments")
    .select("id, project_id, file_id, activity_id, verification_item_id, issue_id, action_id, document_review_id, files(id, storage_key, original_name, project_id)")
    .eq("id", attachmentId)
    .maybeSingle();
  if (error || !data || data.project_id !== projectId || !data.files || data.files.project_id !== projectId) return null;
  return data as LoadedAttachment;
}

/**
 * Short-lived signed URL (60 s) for View / Download, generated only on request and never stored.
 * The attachment, its file and its parent must all belong to projectId.
 */
export async function getEvidenceUrl(
  projectId: string,
  attachmentId: string,
  mode: "view" | "download",
): Promise<ActionResult<{ url: string }>> {
  await requireUser();
  const supabase = await createSupabaseClient();
  const a = await loadAttachment(supabase, projectId, attachmentId);
  const parent = a ? parentOf(a) : null;
  if (!a || !parent) return { ok: false, error: UNAVAILABLE };
  const check = await checkParent(supabase, projectId, parent);
  if (!check.ok) return { ok: false, error: UNAVAILABLE };
  const storage = getStorage(supabase);
  // A missing object must not produce a working-looking link: check it first.
  if (!(await storage.stat(a.files!.storage_key))) return { ok: false, error: UNAVAILABLE };
  try {
    const url = await storage.createSignedUrl(
      a.files!.storage_key,
      SIGNED_URL_SECONDS,
      mode === "download" ? { downloadName: a.files!.original_name } : undefined,
    );
    return { ok: true, data: { url } };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

/**
 * Removes one Evidence attachment (not the business record). Allowed only where the parent is
 * editable. The underlying file row and stored object are removed only when nothing else
 * references the file (other attachments or document versions).
 */
export async function removeEvidence(
  projectId: string,
  attachmentId: string,
): Promise<ActionResult<{ storedFileRemoved: boolean }>> {
  await requireUser();
  const supabase = await createSupabaseClient();
  const a = await loadAttachment(supabase, projectId, attachmentId);
  const parent = a ? parentOf(a) : null;
  if (!a || !parent) return { ok: false, error: "This evidence could not be found." };
  const check = await checkParent(supabase, projectId, parent);
  if (!check.ok) return { ok: false, error: "This evidence could not be found." };
  if (!check.editable) return { ok: false, error: check.lockedReason ?? "Evidence can't be changed here." };

  const { error } = await supabase.from("attachments").delete().eq("id", a.id).eq("project_id", projectId);
  if (error) return { ok: false, error: "Couldn't remove the evidence. Try again." };

  const [otherAttachments, versions] = await Promise.all([
    supabase.from("attachments").select("id", { count: "exact", head: true }).eq("file_id", a.file_id),
    supabase.from("document_versions").select("id", { count: "exact", head: true }).eq("file_id", a.file_id),
  ]);
  let storedFileRemoved = false;
  if (!otherAttachments.error && !versions.error && (otherAttachments.count ?? 0) === 0 && (versions.count ?? 0) === 0) {
    const { error: fileError } = await supabase.from("files").delete().eq("id", a.file_id);
    if (!fileError) {
      try {
        await getStorage(supabase).remove([a.files!.storage_key]);
        storedFileRemoved = true;
      } catch {
        storedFileRemoved = false;
      }
    }
  }

  revalidateParent(projectId, parent, check.activityId);
  return { ok: true, data: { storedFileRemoved } };
}
