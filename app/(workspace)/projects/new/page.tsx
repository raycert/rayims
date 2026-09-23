import { notFound } from "next/navigation";
import { ProjectSetupForm } from "@/components/projects/project-setup-form";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectFormCatalog } from "@/lib/queries/projects";

export const metadata = { title: "New Project" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;
  const catalog = await getProjectFormCatalog();

  if (clientId) {
    const lockedClient = catalog.clients.find((c) => c.id === clientId);
    if (!lockedClient) notFound();

    return (
      <PageContainer>
        <ProjectSetupForm
          mode="create-for-client"
          clients={catalog.clients}
          sitesByClient={catalog.sitesByClient}
          frameworks={catalog.frameworks}
          lockedClient={lockedClient}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ProjectSetupForm
        mode="create-global"
        clients={catalog.clients}
        sitesByClient={catalog.sitesByClient}
        frameworks={catalog.frameworks}
      />
    </PageContainer>
  );
}
