import { requireUser } from "@/lib/auth/session";
import { buildVerificationTemplate } from "@/lib/import/verification-workbook";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getVerificationImportCatalog } from "@/lib/queries/verification-import";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  await requireUser();
  const { projectId } = await params;

  const project = await getProjectWorkspace(projectId);
  if (!project) return new Response("Project not found", { status: 404 });

  const catalog = await getVerificationImportCatalog(projectId);
  const siteActivity = catalog.activities.find((a) => a.siteId !== null);
  const firstFramework = catalog.assignedFrameworks.find((f) => f.items.length > 0);

  const bytes = await buildVerificationTemplate({
    sites: catalog.sites.map((s) => s.name).sort((a, b) => a.localeCompare(b)),
    activityIdentities: catalog.activities.map((a) => a.identity).sort((a, b) => a.localeCompare(b)),
    siteActivityExample: siteActivity?.identity ?? null,
    frameworks: catalog.assignedFrameworks.map((f) => f.identity).sort((a, b) => a.localeCompare(b)),
    frameworkExample: firstFramework
      ? { framework: firstFramework.identity, itemCode: firstFramework.items[0].code }
      : null,
  });

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="RayIMS-Verification-Import-Template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
