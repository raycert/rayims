import { PageContainer } from "@/components/layout/page-container";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`h-4 animate-pulse rounded bg-neutral-soft ${className}`} />;
}

/** Route-level loading state for the projects list (shown during navigation/streaming). */
export default function ProjectsLoading() {
  return (
    <PageContainer>
      <div className="mb-6 flex items-start justify-between">
        <div className="space-y-2">
          <Bar className="h-6 w-32" />
          <Bar className="h-3 w-20" />
        </div>
        <Bar className="h-9 w-32" />
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
        {[0, 1, 2, 3].map((i) => (
          <Bar key={i} className="w-full" />
        ))}
      </div>
    </PageContainer>
  );
}
