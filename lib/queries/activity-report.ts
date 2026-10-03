import { createClient } from "@/lib/supabase/server";
import {
  assembleActivityReport,
  type ActivityReport,
  type RawReportActivity,
  type RawReportActivityAction,
  type RawReportFinding,
  type RawReportVerification,
} from "@/lib/reports/activity-report";
import { siteNameMap } from "./activities";

const EVIDENCE = "attachments(id, project_id, caption, created_at, files(original_name, mime_type, size_bytes))";
const FRAMEWORK = "framework_items(code, title, frameworks(code, edition))";
const ACTION = `id, project_id, description, owner_name, due_date, priority, status, completion_notes, issue_id, activity_id, ${EVIDENCE}`;

/**
 * Activity Report data (Phase 6C) — read-only. Five parallel queries, each filtered by the project
 * (and by the Activity), related rows embedded (no per-row query):
 *   1. the Activity (+ type, consultant, project + client, its own Evidence)
 *   2. site names of the project's scope
 *   3. Verification checks executed here OR planned here (+ requirement, linked Findings, Evidence)
 *   4. Findings with activity_id = this Activity (+ requirement, linked Actions with their Evidence, Evidence)
 *   5. Actions with activity_id = this Activity (+ their Finding reference, Evidence)
 * Every inclusion / de-duplication / ordering rule is applied by `assembleActivityReport` — the same
 * function the report export (6D) must use. Null when the Activity does not exist in this project.
 */
export async function getActivityReportData(projectId: string, activityId: string): Promise<ActivityReport | null> {
  const supabase = await createClient();
  const [activityRes, siteNames, verificationRes, findingRes, actionRes] = await Promise.all([
    supabase
      .from("activities")
      .select(
        `id, project_id, name, status, mode, site_id, start_date, start_time, end_date, end_time, objectives, planned_work, work_performed, summary, next_steps, client_participants, activity_types(label), consultant:profiles!activities_consultant_id_fkey(display_name, email), projects(name, clients(name)), ${EVIDENCE}`,
      )
      .eq("id", activityId)
      .eq("project_id", projectId)
      .maybeSingle(),
    siteNameMap(supabase, projectId),
    supabase
      .from("verification_items")
      .select(
        `id, project_id, question, result, notes, target_activity_id, verified_activity_id, ${FRAMEWORK}, issues(id, project_id, finding_no, title), ${EVIDENCE}`,
      )
      .eq("project_id", projectId)
      .or(`verified_activity_id.eq.${activityId},target_activity_id.eq.${activityId}`),
    supabase
      .from("issues")
      .select(
        `id, project_id, finding_no, finding_type, title, description, priority, status, site_id, activity_id, verification_item_id, document_review_id, ${FRAMEWORK}, actions(${ACTION}), ${EVIDENCE}`,
      )
      .eq("project_id", projectId)
      .eq("activity_id", activityId),
    supabase
      .from("actions")
      .select(`${ACTION}, issues(id, project_id, finding_no, title)`)
      .eq("project_id", projectId)
      .eq("activity_id", activityId),
  ]);
  if (activityRes.error || verificationRes.error || findingRes.error || actionRes.error) {
    throw new Error("Could not load the Activity Report data.");
  }
  if (!activityRes.data) return null;

  return assembleActivityReport({
    projectId,
    activity: activityRes.data as RawReportActivity,
    siteNames,
    verifications: (verificationRes.data ?? []) as RawReportVerification[],
    findings: (findingRes.data ?? []) as RawReportFinding[],
    activityActions: (actionRes.data ?? []) as RawReportActivityAction[],
  });
}
