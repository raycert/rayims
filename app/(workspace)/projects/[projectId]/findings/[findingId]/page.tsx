import { notFound } from "next/navigation";
import { FindingDetailView } from "@/components/findings/finding-detail-view";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectWorkspace } from "@/lib/queries/projects";
import { getFinding, getFindingFormCatalog } from "@/lib/queries/findings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; findingId: string }>;
}) {
  const { projectId, findingId } = await params;
  const finding = await getFinding(projectId, findingId);
  return { title: finding ? finding.title : "Finding" };
}

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; findingId: string }>;
}) {
  const { projectId, findingId } = await params;

  const [project, finding] = await Promise.all([getProjectWorkspace(projectId), getFinding(projectId, findingId)]);
  // Same not-found outcome whether the project or finding doesn't exist, or the finding
  // belongs to a different project — a cross-project URL never reveals which.
  if (!project || !finding) notFound();

  const catalog = await getFindingFormCatalog(projectId);

  return (
    <PageContainer>
      <FindingDetailView projectName={project.name} finding={finding} catalog={catalog} />
    </PageContainer>
  );
}
