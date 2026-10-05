import { HomeView } from "@/components/work/home-view";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/session";
import { getWorkLists } from "@/lib/queries/work";

export const metadata = { title: "Home" };

/** Consultant Home (Phase 7A): what needs attention across Projects. The route stays /dashboard (post-login default). */
export default async function HomePage() {
  await requireUser();
  const lists = await getWorkLists({ scopeProjectId: null, limit: 5 });
  return (
    <PageContainer>
      <PageHeader title="Home" description="What needs your attention across your projects." />
      <HomeView lists={lists} />
    </PageContainer>
  );
}
