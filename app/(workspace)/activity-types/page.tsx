import { ActivityTypeListView } from "@/components/activity-types/activity-type-list-view";
import { PageContainer } from "@/components/layout/page-container";
import { listActivityTypes } from "@/lib/queries/activity-types";
import { getCurrentUserRole } from "@/lib/auth/session";

export const metadata = { title: "Activity Types" };

export default async function ActivityTypesPage() {
  // The (workspace) layout already verifies the session (requireUser(), memoized).
  const [activityTypes, role] = await Promise.all([listActivityTypes(), getCurrentUserRole()]);

  return (
    <PageContainer>
      <ActivityTypeListView activityTypes={activityTypes} isAdmin={role === "admin"} />
    </PageContainer>
  );
}
