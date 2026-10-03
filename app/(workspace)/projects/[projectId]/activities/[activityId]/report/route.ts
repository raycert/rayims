import { requireUser } from "@/lib/auth/session";
import { getActivityReportData } from "@/lib/queries/activity-report";
import { activityReportFileName, buildActivityReportDocx } from "@/lib/reports/activity-report-docx";
import { safeTimeZone } from "@/lib/export/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Activity Report export (Phase 6D, ADR-020): the current Activity Report as an editable .docx,
 * generated on demand from the SAME model the Activity Detail summary shows (getActivityReportData).
 * Only the route ids come from the browser (plus a time zone used for formatting); nothing is
 * written, stored or recorded.
 */
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; activityId: string }> }) {
  await requireUser();
  const { projectId, activityId } = await params;
  if (!UUID.test(projectId) || !UUID.test(activityId)) return new Response("Activity not found", { status: 404 });
  const timeZone = safeTimeZone(new URL(request.url).searchParams.get("tz"));

  try {
    // Null when the Activity does not exist in this project (cross-project ids included).
    const report = await getActivityReportData(projectId, activityId);
    if (!report) return new Response("Activity not found", { status: 404 });

    const generatedAt = new Date();
    const bytes = await buildActivityReportDocx(report, { generatedAt, timeZone });
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${activityReportFileName(report, generatedAt, timeZone)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Could not export the Activity Report.", { status: 500 });
  }
}
