import { notFound } from "next/navigation";
import { ProjectWorkspaceView } from "@/components/projects/project-workspace-view";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { listUpcomingActivities } from "@/lib/queries/activities";
import { listOverdueActions } from "@/lib/queries/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  if (!project) notFound();

  const [upcomingActivities, overdueActions] = await Promise.all([
    listUpcomingActivities(projectId),
    listOverdueActions(projectId),
  ]);

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="overview" />
      <ProjectWorkspaceView project={project} upcomingActivities={upcomingActivities} overdueActions={overdueActions} />
    </PageContainer>
  );
}
