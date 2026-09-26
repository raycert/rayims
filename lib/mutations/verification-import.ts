"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { MAX_IMPORT_FILE_BYTES, parseVerificationWorkbook } from "@/lib/import/verification-workbook";
import { getVerificationImportCatalog } from "@/lib/queries/verification-import";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { toPreview, validateImportRows, type ImportPreview, type ValidatedRow } from "@/lib/validation/verification-import";
import type { ActionResult } from "./types";

export type ImportOutcome = { imported: true; count: number } | { imported: false; preview: ImportPreview };

const FILE_TOO_LARGE = "This file is larger than 2 MB. Split it into smaller files.";
const WRONG_TYPE = "Only .xlsx workbooks are supported.";

/**
 * Shared by Preview and Import so no rule exists twice: read the uploaded file, parse it,
 * load a FRESH project catalog, validate. Nothing from an earlier preview is ever reused.
 */
async function validateUpload(
  projectId: string,
  formData: FormData,
): Promise<{ ok: true; rows: ValidatedRow[] } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a .xlsx file to import." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, error: WRONG_TYPE };
  if (file.size > MAX_IMPORT_FILE_BYTES) return { ok: false, error: FILE_TOO_LARGE };

  const supabase = await createSupabaseClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return { ok: false, error: "Couldn't check the project. Try again." };
  if (!project) return { ok: false, error: "This project could not be found." };

  const parsed = await parseVerificationWorkbook(new Uint8Array(await file.arrayBuffer()));
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    const catalog = await getVerificationImportCatalog(projectId);
    return { ok: true, rows: validateImportRows(parsed.rows, catalog) };
  } catch {
    return { ok: false, error: "Couldn't load this project's data to validate the file. Try again." };
  }
}

/** Validates the workbook and returns a preview. Writes nothing. */
export async function previewVerificationImport(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ImportPreview>> {
  await requireUser();
  const result = await validateUpload(projectId, formData);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: toPreview(result.rows) };
}

/**
 * Re-parses and re-validates the workbook against the project's CURRENT state, then
 * creates every row with ONE bulk insert (a single SQL statement: all rows or none).
 * The client's preview is never trusted. Only planning columns are written — result,
 * notes, verified_activity_id, verified_by and verified_at are never referenced, so
 * they stay NULL exactly as for a manually created item.
 */
export async function importVerificationItems(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<ImportOutcome>> {
  const user = await requireUser();
  const result = await validateUpload(projectId, formData);
  if (!result.ok) return { ok: false, error: result.error };

  if (result.rows.some((r) => r.status === "error")) {
    return { ok: true, data: { imported: false, preview: toPreview(result.rows) } };
  }

  const payload = result.rows.map((r) => {
    const i = r.insert!;
    return {
      project_id: projectId,
      question: i.question,
      priority: i.priority,
      site_id: i.siteId,
      target_activity_id: i.targetActivityId,
      framework_item_id: i.frameworkItemId,
      created_by: user.id,
    };
  });

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.from("verification_items").insert(payload).select("id");
  if (error) return { ok: false, error: "Couldn't import the verification items. Nothing was imported. Try again." };

  revalidatePath(`/projects/${projectId}/verification`);
  for (const activityId of new Set(payload.map((p) => p.target_activity_id).filter((id): id is string => !!id))) {
    revalidatePath(`/projects/${projectId}/activities/${activityId}`);
  }
  return { ok: true, data: { imported: true, count: data?.length ?? payload.length } };
}
