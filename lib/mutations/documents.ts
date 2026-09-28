"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { documentSchema } from "@/lib/validation/documents";
import { evaluateDocumentDelete, type DeleteEvaluation } from "@/lib/domain/delete-rules";
import { frameworkItemsInProjectScope, siteInProjectScope, type SupabaseServerClient } from "./scope-validation";
import { fieldErrorsFrom, type ActionResult } from "./types";

const OUT_OF_SCOPE = "A selected framework requirement is not assigned to this project.";

function revalidateDocuments(projectId: string, documentId?: string) {
  revalidatePath(`/projects/${projectId}/documents`);
  if (documentId) revalidatePath(`/projects/${projectId}/documents/${documentId}`);
}

async function projectExists(supabase: SupabaseServerClient, projectId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) return null;
  return !!data;
}

/**
 * Creates a logical Document with its Framework mappings (Phase 5A). Everything is validated
 * BEFORE any write: the site against project_sites and every framework item against the
 * project's currently assigned Frameworks. project_id is the trusted route value, created_by the
 * session user; status is never written (derived, ADR-005). If the mapping insert fails the new
 * Document is removed again, so a failed save never leaves a half-created record.
 */
export async function createDocument(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;
  const supabase = await createSupabaseClient();

  const exists = await projectExists(supabase, projectId);
  if (exists === null) return { ok: false, error: "Couldn't create the document. Try again." };
  if (!exists) return { ok: false, error: "This project could not be found." };
  if (!(await siteInProjectScope(supabase, projectId, d.siteId))) {
    return { ok: false, error: "The selected site is not in this project's scope.", fieldErrors: { siteId: "Not in this project's scope." } };
  }
  if (!(await frameworkItemsInProjectScope(supabase, projectId, d.frameworkItemIds))) {
    return { ok: false, error: OUT_OF_SCOPE, fieldErrors: { frameworkItemIds: OUT_OF_SCOPE } };
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      project_id: projectId,
      title: d.title,
      doc_code: d.docCode,
      document_type: d.documentType,
      owner_name: d.ownerName,
      site_id: d.siteId,
      is_applicable: d.isApplicable,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !doc) return { ok: false, error: "Couldn't create the document. Try again." };

  if (d.frameworkItemIds.length > 0) {
    const { error: mapError } = await supabase
      .from("document_framework_items")
      .insert(d.frameworkItemIds.map((framework_item_id) => ({ document_id: doc.id, framework_item_id })));
    if (mapError) {
      await supabase.from("documents").delete().eq("id", doc.id).eq("project_id", projectId);
      return { ok: false, error: "Couldn't save the framework requirements. The document was not created. Try again." };
    }
  }

  revalidateDocuments(projectId);
  return { ok: true, data: { id: doc.id } };
}

/**
 * Updates the identity fields and the mapping set of a Document of this project. Mappings are
 * diffed: NEW items must be in the project's assigned Frameworks; existing (possibly historical,
 * now-unassigned) mappings may be kept or removed but never re-validated. Order of writes keeps a
 * failure recoverable: add new mappings → remove dropped ones → update fields, undoing the
 * earlier steps (best effort) if a later one fails. created_by / created_at are never touched.
 */
export async function updateDocument(projectId: string, documentId: string, input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;
  const supabase = await createSupabaseClient();

  const { data: existing, error: loadError } = await supabase
    .from("documents")
    .select("id, project_id, document_framework_items(framework_item_id)")
    .eq("id", documentId)
    .maybeSingle();
  if (loadError) return { ok: false, error: "Couldn't save the document. Try again." };
  if (!existing || existing.project_id !== projectId) return { ok: false, error: "This document could not be found." };

  if (!(await siteInProjectScope(supabase, projectId, d.siteId))) {
    return { ok: false, error: "The selected site is not in this project's scope.", fieldErrors: { siteId: "Not in this project's scope." } };
  }
  const current = new Set((existing.document_framework_items ?? []).map((m) => m.framework_item_id));
  const wanted = new Set(d.frameworkItemIds);
  const toAdd = [...wanted].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !wanted.has(id));
  if (!(await frameworkItemsInProjectScope(supabase, projectId, toAdd))) {
    return { ok: false, error: OUT_OF_SCOPE, fieldErrors: { frameworkItemIds: OUT_OF_SCOPE } };
  }

  const undoAdd = async () => {
    if (toAdd.length > 0) await supabase.from("document_framework_items").delete().eq("document_id", documentId).in("framework_item_id", toAdd);
  };
  const undoRemove = async () => {
    if (toRemove.length > 0) {
      await supabase.from("document_framework_items").insert(toRemove.map((framework_item_id) => ({ document_id: documentId, framework_item_id })));
    }
  };

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("document_framework_items")
      .insert(toAdd.map((framework_item_id) => ({ document_id: documentId, framework_item_id })));
    if (error) return { ok: false, error: "Couldn't save the framework requirements. Nothing was changed. Try again." };
  }
  if (toRemove.length > 0) {
    const { error } = await supabase.from("document_framework_items").delete().eq("document_id", documentId).in("framework_item_id", toRemove);
    if (error) {
      await undoAdd();
      return { ok: false, error: "Couldn't save the framework requirements. Nothing was changed. Try again." };
    }
  }

  const { data, error } = await supabase
    .from("documents")
    .update({
      title: d.title,
      doc_code: d.docCode,
      document_type: d.documentType,
      owner_name: d.ownerName,
      site_id: d.siteId,
      is_applicable: d.isApplicable,
    })
    .eq("id", documentId)
    .eq("project_id", projectId)
    .select("id");
  if (error || !data || data.length === 0) {
    await undoAdd();
    await undoRemove();
    return { ok: false, error: "Couldn't save the document. Nothing was changed. Try again." };
  }

  revalidateDocuments(projectId, documentId);
  return { ok: true, data: undefined };
}

type LoadedDocumentDelete = { ok: true; evaluation: DeleteEvaluation } | { ok: false; error: string };

async function loadDocumentDelete(supabase: SupabaseServerClient, projectId: string, documentId: string): Promise<LoadedDocumentDelete> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, project_id, document_versions(count)")
    .eq("id", documentId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't load the document. Try again." };
  if (!data || data.project_id !== projectId) return { ok: false, error: "This document could not be found." };
  return { ok: true, evaluation: evaluateDocumentDelete({ versionCount: data.document_versions[0]?.count ?? 0 }) };
}

/** Whether a Document may be deleted, with every blocker (read-only; delete re-checks). */
export async function getDocumentDeleteState(projectId: string, documentId: string): Promise<ActionResult<DeleteEvaluation>> {
  await requireUser();
  const supabase = await createSupabaseClient();
  const loaded = await loadDocumentDelete(supabase, projectId, documentId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  return { ok: true, data: loaded.evaluation };
}

/**
 * Controlled delete (Phase 5A): only a Document with no Versions (so no reviews, files or
 * review-origin Findings). Its framework mappings cascade — they are setup data. The rule is
 * re-evaluated on freshly loaded data; versions are never cascade-deleted by design.
 */
export async function deleteDocument(projectId: string, documentId: string): Promise<ActionResult<DeleteEvaluation>> {
  await requireUser();
  const supabase = await createSupabaseClient();
  const loaded = await loadDocumentDelete(supabase, projectId, documentId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.evaluation.canDelete) return { ok: false, error: loaded.evaluation.blockers.join(" ") };

  const { data, error } = await supabase.from("documents").delete().eq("id", documentId).eq("project_id", projectId).select("id");
  if (error) return { ok: false, error: "Couldn't delete the document. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This document could not be deleted. It may have been changed." };

  revalidateDocuments(projectId);
  return { ok: true, data: loaded.evaluation };
}
