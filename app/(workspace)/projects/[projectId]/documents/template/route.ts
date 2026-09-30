import { requireUser } from "@/lib/auth/session";
import { buildDocumentRegisterTemplate } from "@/lib/import/document-register-workbook";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getDocumentImportCatalog } from "@/lib/queries/document-import";

/** Required Document import template (Phase 5E), with this project's Frameworks and Sites. */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  await requireUser();
  const { projectId } = await params;

  const project = await getProjectWorkspace(projectId);
  if (!project) return new Response("Project not found", { status: 404 });

  const catalog = await getDocumentImportCatalog(projectId);
  const firstFramework = catalog.assignedFrameworks.find((f) => f.items.length > 0);
  const bytes = await buildDocumentRegisterTemplate({
    sites: catalog.sites.map((s) => s.name).sort((a, b) => a.localeCompare(b)),
    frameworks: catalog.assignedFrameworks.map((f) => f.identity).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    frameworkExample: firstFramework
      ? { framework: firstFramework.identity, code: firstFramework.items.find((i) => i.code === "7.5")?.code ?? firstFramework.items[0].code }
      : null,
  });

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="RayIMS-Required-Documents-Template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
