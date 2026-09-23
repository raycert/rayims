import { ProjectListView } from "@/components/projects/project-list-view";
import { PageContainer } from "@/components/layout/page-container";
import { listProjects } from "@/lib/queries/projects";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <PageContainer>
      <ProjectListView projects={projects} />
    </PageContainer>
  );
}
