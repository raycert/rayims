import { notFound } from "next/navigation";
import { DocumentDetailView } from "@/components/documents/document-detail-view";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getDocument, getDocumentFormCatalog } from "@/lib/queries/documents";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;
  const document = await getDocument(projectId, documentId);
  return { title: document ? document.title : "Document" };
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;

  const [project, document, catalog] = await Promise.all([
    getProjectWorkspace(projectId),
    getDocument(projectId, documentId),
    getDocumentFormCatalog(projectId),
  ]);
  // Same not-found outcome whether the project or document doesn't exist, or the document
  // belongs to a different project — a cross-project URL never reveals which.
  if (!project || !document) notFound();

  return (
    <PageContainer>
      <DocumentDetailView projectName={project.name} document={document} catalog={catalog} />
    </PageContainer>
  );
}
