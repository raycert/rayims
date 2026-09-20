import { LayoutDashboard } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Dashboard · RayIMS" };

export default function DashboardPage() {
  return (
    <PageContainer>
      <PageHeader title="Dashboard" />
      <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
        <LayoutDashboard className="size-8 text-muted" aria-hidden />
        <h2 className="mt-3 text-base font-medium">Your workspace is ready</h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          Projects, planning and site verification will appear here as they are built.
        </p>
      </div>
    </PageContainer>
  );
}
