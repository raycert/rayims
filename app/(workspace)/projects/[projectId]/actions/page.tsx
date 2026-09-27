import { notFound } from "next/navigation";
import { ActionsWorkspaceView } from "@/components/actions/actions-workspace-view";
import { FindingsSubnav } from "@/components/findings/findings-subnav";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { listProjectActions } from "@/lib/queries/actions";
import { getFindingFormCatalog } from "@/lib/queries/findings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  return { title: project ? `Actions · ${project.name}` : "Actions" };
}

export default async function ProjectActionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  if (!project) notFound();

  const [actions, catalog] = await Promise.all([listProjectActions(projectId), getFindingFormCatalog(projectId)]);

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="findings" />
      <FindingsSubnav projectId={projectId} active="actions" />
      <ActionsWorkspaceView projectId={projectId} actions={actions} catalog={catalog} />
    </PageContainer>
  );
}
