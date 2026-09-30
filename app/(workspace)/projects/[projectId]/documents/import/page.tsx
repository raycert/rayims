import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportDocumentsView } from "@/components/documents/import-documents-view";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  return { title: project ? `Import Required Documents · ${project.name}` : "Import Required Documents" };
}

export default async function ImportDocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  if (!project) notFound();

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="documents" />
      <Link href={`/projects/${projectId}/documents`} className="mb-4 inline-block text-sm font-semibold text-primary hover:underline">
        ← Back to Documents
      </Link>
      <ImportDocumentsView projectId={projectId} />
    </PageContainer>
  );
}
