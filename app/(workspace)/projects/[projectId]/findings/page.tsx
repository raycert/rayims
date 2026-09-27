import { notFound } from "next/navigation";
import { FindingsWorkspaceView } from "@/components/findings/findings-workspace-view";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getFindingFormCatalog, listFindings } from "@/lib/queries/findings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  return { title: project ? `Findings · ${project.name}` : "Findings" };
}

export default async function ProjectFindingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  if (!project) notFound();

  const [findings, catalog] = await Promise.all([listFindings(projectId), getFindingFormCatalog(projectId)]);

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="findings" />
      <FindingsWorkspaceView projectId={projectId} findings={findings} catalog={catalog} />
    </PageContainer>
  );
}
