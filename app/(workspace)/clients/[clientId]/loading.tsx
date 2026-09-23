import { PageContainer } from "@/components/layout/page-container";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`h-4 animate-pulse rounded bg-neutral-soft ${className}`} />;
}

/** Route-level loading state for a client's detail page. */
export default function ClientDetailLoading() {
  return (
    <PageContainer>
      <div className="mb-6 space-y-3">
        <Bar className="h-3 w-24" />
        <Bar className="h-6 w-56" />
        <Bar className="h-3 w-40" />
      </div>
      <div className="mb-4 space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
        {[0, 1, 2].map((i) => (
          <Bar key={i} className="w-full" />
        ))}
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <Bar className="w-full" />
      </div>
    </PageContainer>
  );
}
