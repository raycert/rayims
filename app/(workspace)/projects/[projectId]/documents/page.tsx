import { notFound } from "next/navigation";
import { DocumentsWorkspaceView } from "@/components/documents/documents-workspace-view";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getDocumentFormCatalog, listDocuments } from "@/lib/queries/documents";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  return { title: project ? `Documents · ${project.name}` : "Documents" };
}

export default async function ProjectDocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  if (!project) notFound();

  const [documents, catalog] = await Promise.all([listDocuments(projectId), getDocumentFormCatalog(projectId)]);

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="documents" />
      <DocumentsWorkspaceView projectId={projectId} documents={documents} catalog={catalog} />
    </PageContainer>
  );
}
