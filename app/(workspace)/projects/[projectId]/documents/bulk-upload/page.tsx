import Link from "next/link";
import { notFound } from "next/navigation";
import { BulkUploadView } from "@/components/documents/bulk-upload-view";
import { ProjectWorkspaceHeader } from "@/components/projects/project-workspace-header";
import { PageContainer } from "@/components/layout/page-container";
import { getBulkUploadCatalog } from "@/lib/queries/bulk-upload";
import { getProjectWorkspace } from "@/lib/queries/projects";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  return { title: project ? `Bulk Upload · ${project.name}` : "Bulk Upload" };
}

/** Phase 7C: attach many client files to existing Required Documents (creates Versions; never Documents). */
export default async function BulkUploadPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  if (!project) notFound();
  const catalog = await getBulkUploadCatalog(projectId);

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="documents" />
      <Link href={`/projects/${projectId}/documents`} className="mb-4 inline-block text-sm font-semibold text-primary hover:underline">
        ← Back to Documents
      </Link>
      <BulkUploadView projectId={projectId} catalog={catalog} />
    </PageContainer>
  );
}
