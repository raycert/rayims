import { FrameworkLibraryView } from "@/components/frameworks/framework-library-view";
import { PageContainer } from "@/components/layout/page-container";
import { listFrameworkCategories, listFrameworks } from "@/lib/queries/frameworks";
import { getCurrentUserRole } from "@/lib/auth/session";

export const metadata = { title: "Framework Library" };

export default async function FrameworksPage() {
  // The (workspace) layout already verifies the session (requireUser(), memoized).
  const [frameworks, categories, role] = await Promise.all([
    listFrameworks(),
    listFrameworkCategories(),
    getCurrentUserRole(),
  ]);

  return (
    <PageContainer>
      <FrameworkLibraryView frameworks={frameworks} categories={categories} isAdmin={role === "admin"} />
    </PageContainer>
  );
}
