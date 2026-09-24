import { PageContainer } from "@/components/layout/page-container";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`h-4 animate-pulse rounded bg-neutral-soft ${className}`} />;
}

/** Route-level loading state for Activity Detail (shown during navigation/streaming). */
export default function ActivityDetailLoading() {
  return (
    <PageContainer>
      <div className="mb-6 space-y-3">
        <Bar className="h-3 w-56" />
        <Bar className="h-7 w-72" />
        <Bar className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-5 [@media(min-width:860px)]:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
            <Bar className="w-full" />
            <Bar className="w-full" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
