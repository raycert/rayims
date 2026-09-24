import { notFound } from "next/navigation";
import { MasterPlanView } from "@/components/projects/master-plan-view";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getActivityFormCatalog, listActivities } from "@/lib/queries/activities";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  return { title: project ? `Plan · ${project.name}` : "Plan" };
}

export default async function ProjectPlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  if (!project) notFound();

  const [activities, catalog] = await Promise.all([
    listActivities(projectId),
    getActivityFormCatalog(projectId),
  ]);

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="plan" />
      <MasterPlanView projectId={projectId} activities={activities} catalog={catalog} />
    </PageContainer>
  );
}
