import { notFound } from "next/navigation";
import { ProjectSetupForm } from "@/components/projects/project-setup-form";
import { PageContainer } from "@/components/layout/page-container";
import { getProjectForEdit, getProjectFormCatalog } from "@/lib/queries/projects";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectForEdit(projectId);
  return { title: project ? `Edit ${project.name}` : "Edit Project" };
}

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, catalog] = await Promise.all([getProjectForEdit(projectId), getProjectFormCatalog()]);
  if (!project) notFound();

  return (
    <PageContainer>
      <ProjectSetupForm
        mode="edit"
        clients={catalog.clients}
        sitesByClient={catalog.sitesByClient}
        frameworks={catalog.frameworks}
        lockedClient={{ id: project.clientId, name: project.clientName }}
        project={project}
      />
    </PageContainer>
  );
}
