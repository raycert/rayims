import { notFound } from "next/navigation";
import { ActivityDetailView } from "@/components/activities/activity-detail-view";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getActivity, getActivityFormCatalog } from "@/lib/queries/activities";
import { getVerificationFormCatalog, listActivityVerificationItems } from "@/lib/queries/verification-items";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; activityId: string }>;
}) {
  const { projectId, activityId } = await params;
  const activity = await getActivity(projectId, activityId);
  return { title: activity ? activity.name : "Activity" };
}

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; activityId: string }>;
}) {
  const { projectId, activityId } = await params;

  const [project, activity] = await Promise.all([
    getProjectWorkspace(projectId),
    getActivity(projectId, activityId),
  ]);
  // Same not-found outcome whether the project doesn't exist, the activity doesn't
  // exist, or the activity belongs to a different project — a cross-project URL
  // never distinguishes "wrong id" from "right id, wrong project".
  if (!project || !activity) notFound();

  const [catalog, verificationItems, verificationCatalog] = await Promise.all([
    getActivityFormCatalog(projectId, activity.activityTypeId),
    listActivityVerificationItems(projectId, activityId),
    getVerificationFormCatalog(projectId),
  ]);

  return (
    <PageContainer>
      <ActivityDetailView
        projectName={project.name}
        activity={activity}
        catalog={catalog}
        verificationItems={verificationItems}
        verificationCatalog={verificationCatalog}
      />
    </PageContainer>
  );
}
