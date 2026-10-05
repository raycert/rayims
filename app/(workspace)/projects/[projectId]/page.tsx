import { notFound } from "next/navigation";
import { ProjectWorkspaceView } from "@/components/projects/project-workspace-view";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getWorkLists } from "@/lib/queries/work";

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

  const { upcoming: upcomingActivities, overdue: overdueActions } = await getWorkLists({ scopeProjectId: projectId, limit: 3 });

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="overview" />
      <ProjectWorkspaceView project={project} upcomingActivities={upcomingActivities} overdueActions={overdueActions} />
    </PageContainer>
  );
}
