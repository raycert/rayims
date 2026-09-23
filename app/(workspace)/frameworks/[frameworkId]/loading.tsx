import { PageContainer } from "@/components/layout/page-container";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`h-4 animate-pulse rounded bg-neutral-soft ${className}`} />;
}

/** Route-level loading state for framework detail (shown during navigation/streaming). */
export default function FrameworkDetailLoading() {
  return (
    <PageContainer>
      <div className="mb-6 space-y-3">
        <Bar className="h-3 w-40" />
        <Bar className="h-7 w-56" />
        <Bar className="h-4 w-64" />
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Bar key={i} className="w-full" />
        ))}
      </div>
    </PageContainer>
  );
}
