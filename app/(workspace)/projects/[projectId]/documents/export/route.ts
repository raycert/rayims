import { requireUser } from "@/lib/auth/session";
import { buildGapAssessmentWorkbook, gapAssessmentFileName, safeTimeZone } from "@/lib/export/gap-assessment-workbook";
import { getGapAssessmentExport } from "@/lib/queries/document-export";
import { getProjectWorkspace } from "@/lib/queries/projects";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gap Assessment Register export (Phase 5F). Read-only: the server loads the project's current
 * register itself (nothing is taken from the browser) and returns the whole register as .xlsx.
 */
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  await requireUser();
  const { projectId } = await params;
  if (!UUID.test(projectId)) return new Response("Project not found", { status: 404 });
  // Formatting only (Last Review day, export time): the viewer's zone, like the Document screens.
  const timeZone = safeTimeZone(new URL(request.url).searchParams.get("tz"));

  try {
    const project = await getProjectWorkspace(projectId);
    if (!project) return new Response("Project not found", { status: 404 });

    const generatedAt = new Date();
    const documents = await getGapAssessmentExport(projectId);
    const bytes = await buildGapAssessmentWorkbook({ projectName: project.name, clientName: project.clientName, documents, generatedAt, timeZone });

    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${gapAssessmentFileName(project.name, generatedAt, timeZone)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Could not export the Gap Assessment Register.", { status: 500 });
  }
}
