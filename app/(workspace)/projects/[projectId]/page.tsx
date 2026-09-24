import { notFound } from "next/navigation";
import { ProjectWorkspaceView } from "@/components/projects/project-workspace-view";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { listUpcomingActivities } from "@/lib/queries/activities";

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

  const upcomingActivities = await listUpcomingActivities(projectId);

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="overview" />
      <ProjectWorkspaceView project={project} upcomingActivities={upcomingActivities} />
    </PageContainer>
  );
}
