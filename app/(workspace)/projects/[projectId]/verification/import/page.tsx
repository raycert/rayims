import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportVerificationView } from "@/components/verification/import-verification-view";
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
  return { title: project ? `Import Verification Items · ${project.name}` : "Import Verification Items" };
}

export default async function ImportVerificationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);
  if (!project) notFound();

  return (
    <PageContainer>
      <ProjectWorkspaceHeader project={project} activeTab="verification" />
      <Link
        href={`/projects/${projectId}/verification`}
        className="mb-4 inline-block text-sm font-semibold text-primary hover:underline"
      >
        ← Back to Verification
      </Link>
      <ImportVerificationView projectId={projectId} />
    </PageContainer>
  );
}
