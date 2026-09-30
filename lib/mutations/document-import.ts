"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { MAX_IMPORT_FILE_BYTES, parseDocumentRegisterWorkbook } from "@/lib/import/document-register-workbook";
import { getDocumentImportCatalog } from "@/lib/queries/document-import";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { normalizeTitle, toPreview, validateDocumentRows, type ImportPreview } from "@/lib/validation/document-import";
import type { ActionResult } from "./types";

export type DocumentImportOutcome =
  | { imported: true; created: number; skipped: number; warnings: number }
  | { imported: false; preview: ImportPreview; reason: "errors" | "warnings-changed" };

const FILE_TOO_LARGE = "This file is larger than 2 MB. Split it into smaller files.";
const WRONG_TYPE = "Only .xlsx workbooks are supported.";

/**
 * Shared by Preview and Import so no rule exists twice: read the uploaded file, parse it on the
 * server, load a FRESH project catalog, validate. Nothing from an earlier preview is reused.
 */
async function validateUpload(projectId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Choose a .xlsx file to import." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false as const, error: WRONG_TYPE };
  if (file.size > MAX_IMPORT_FILE_BYTES) return { ok: false as const, error: FILE_TOO_LARGE };

  const supabase = await createSupabaseClient();
  const { data: project, error: projectError } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (projectError) return { ok: false as const, error: "Couldn't check the project. Try again." };
  if (!project) return { ok: false as const, error: "This project could not be found." };

  const parsed = await parseDocumentRegisterWorkbook(new Uint8Array(await file.arrayBuffer()));
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  try {
    const catalog = await getDocumentImportCatalog(projectId);
    return { ok: true as const, result: validateDocumentRows(parsed.rows, catalog) };
  } catch {
    return { ok: false as const, error: "Couldn't load this project's data to validate the file. Try again." };
  }
}

/** Validates the workbook and returns a preview. Writes nothing. */
export async function previewDocumentImport(projectId: string, formData: FormData): Promise<ActionResult<ImportPreview>> {
  await requireUser();
  const v = await validateUpload(projectId, formData);
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, data: toPreview(v.result) };
}

/**
 * Create-only import of the Required Document register (Phase 5E). Re-parses and re-validates the
 * workbook against the project's CURRENT state; any error → nothing is written. Warnings must have
 * been confirmed, and the fresh warning count must equal the confirmed one (a changed project since
 * the preview — e.g. a document created meanwhile — returns the new preview instead of importing).
 * Writes: ONE bulk insert of Documents (a single statement: all or none), then ONE bulk insert of
 * their Framework mappings; if the mapping insert fails, the new Documents are deleted again.
 * Existing Documents are never updated. No Version, Review or file is created.
 */
export async function importDocuments(projectId: string, formData: FormData): Promise<ActionResult<DocumentImportOutcome>> {
  const user = await requireUser();
  const v = await validateUpload(projectId, formData);
  if (!v.ok) return { ok: false, error: v.error };
  const preview = toPreview(v.result);
  if (preview.errorCount > 0) return { ok: true, data: { imported: false, preview, reason: "errors" } };
  const confirmed = Number(formData.get("confirmedWarnings") ?? 0);
  if (preview.warningCount > 0 && confirmed !== preview.warningCount) {
    return { ok: true, data: { imported: false, preview, reason: "warnings-changed" } };
  }

  const groups = v.result.groups;
  if (groups.length === 0) {
    return { ok: true, data: { imported: true, created: 0, skipped: preview.skipCount, warnings: preview.warningCount } };
  }

  const supabase = await createSupabaseClient();
  const { data: docs, error } = await supabase
    .from("documents")
    .insert(
      groups.map((g) => ({
        project_id: projectId,
        title: g.title,
        doc_code: g.docCode,
        document_type: g.documentType,
        owner_name: g.ownerName,
        site_id: g.siteId,
        is_applicable: g.isApplicable,
        created_by: user.id,
      })),
    )
    .select("id, title, site_id");
  if (error || !docs) return { ok: false, error: "Couldn't import the documents. Nothing was imported. Try again." };

  // Match created rows back to their group by identity (title + site is unique among the groups).
  const idByKey = new Map(docs.map((d) => [`${normalizeTitle(d.title)}|${d.site_id ?? ""}`, d.id]));
  const mappings = groups.flatMap((g) => {
    const documentId = idByKey.get(g.key);
    return documentId ? g.frameworkItemIds.map((framework_item_id) => ({ document_id: documentId, framework_item_id })) : [];
  });
  if (mappings.length > 0) {
    const { error: mapError } = await supabase.from("document_framework_items").insert(mappings);
    if (mapError) {
      await supabase
        .from("documents")
        .delete()
        .in(
          "id",
          docs.map((d) => d.id),
        )
        .eq("project_id", projectId);
      return { ok: false, error: "Couldn't save the framework requirements. Nothing was imported. Try again." };
    }
  }

  revalidatePath(`/projects/${projectId}/documents`);
  return { ok: true, data: { imported: true, created: docs.length, skipped: preview.skipCount, warnings: preview.warningCount } };
}
