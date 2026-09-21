"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { MessagePanel } from "@/components/layout/message-panel";
import { PageContainer } from "@/components/layout/page-container";

/** Error boundary for pages inside the workspace: the shell (navigation) stays usable. */
export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer>
      <title>Something went wrong · RayIMS</title>
      <MessagePanel
        icon={TriangleAlert}
        title="Something went wrong"
        description="We couldn't load this page. Try again, or go back to the dashboard."
      >
        <Button onClick={() => retry()}>Try again</Button>
        <Link href="/dashboard" className={buttonClasses("secondary")}>
          Go to dashboard
        </Link>
        {error.digest ? (
          <p className="w-full text-xs text-muted">Reference: {error.digest}</p>
        ) : null}
      </MessagePanel>
    </PageContainer>
  );
}
