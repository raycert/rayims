import { notFound } from "next/navigation";
import { FrameworkDetailView } from "@/components/frameworks/framework-detail-view";
import { PageContainer } from "@/components/layout/page-container";
import { getFrameworkDetail, listFrameworkCategories } from "@/lib/queries/frameworks";
import { getCurrentUserRole } from "@/lib/auth/session";
import { formatFrameworkIdentity } from "@/lib/ui/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ frameworkId: string }>;
}) {
  const { frameworkId } = await params;
  const framework = await getFrameworkDetail(frameworkId);
  return { title: framework ? formatFrameworkIdentity(framework.code, framework.edition) : "Framework" };
}

export default async function FrameworkDetailPage({
  params,
}: {
  params: Promise<{ frameworkId: string }>;
}) {
  const { frameworkId } = await params;
  const [framework, categories, role] = await Promise.all([
    getFrameworkDetail(frameworkId),
    listFrameworkCategories(),
    getCurrentUserRole(),
  ]);
  if (!framework) notFound();

  return (
    <PageContainer>
      <FrameworkDetailView framework={framework} categories={categories} isAdmin={role === "admin"} />
    </PageContainer>
  );
}
