import { notFound } from "next/navigation";
import { VerificationWorkspaceView } from "@/components/verification/verification-workspace-view";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getVerificationFormCatalog, listVerificationItems } from "@/lib/queries/verification-items";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  return { title: project ? `Verification · ${project.name}` : "Verification" };
}

export default async function ProjectVerificationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  if (!project) notFound();

  const [items, catalog] = await Promise.all([
    listVerificationItems(projectId),
    getVerificationFormCatalog(projectId),
  ]);

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="verification" />
      <VerificationWorkspaceView projectId={projectId} items={items} catalog={catalog} />
    </PageContainer>
  );
}
