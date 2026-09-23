import { PageContainer } from "@/components/layout/page-container";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`h-4 animate-pulse rounded bg-neutral-soft ${className}`} />;
}

/** Route-level loading state for the project workspace (shown during navigation/streaming). */
export default function ProjectWorkspaceLoading() {
  return (
    <PageContainer>
      <div className="mb-6 space-y-3">
        <Bar className="h-3 w-40" />
        <Bar className="h-7 w-72" />
        <Bar className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.7fr_1fr]">
        <div className="space-y-5">
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
            {[0, 1, 2].map((i) => (
              <Bar key={i} className="w-full" />
            ))}
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
            {[0, 1].map((i) => (
              <Bar key={i} className="w-full" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
          {[0, 1, 2].map((i) => (
            <Bar key={i} className="w-full" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
