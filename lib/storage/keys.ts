/**
 * Storage key convention: `{project_id}/{uuid}-{sanitized-file-name}`.
 * The project prefix lets orphaned objects be found and removed per project.
 */
export function buildStorageKey(projectId: string, originalName: string) {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = dot > 0 ? originalName.slice(dot + 1) : "";

  const safeBase =
    base
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file";
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 10);

  return `${projectId}/${crypto.randomUUID()}-${safeBase}${safeExt ? `.${safeExt}` : ""}`;
}
