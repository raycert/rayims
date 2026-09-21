import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Proxy already redirects visitors without a session; verify again here because
  // Proxy alone is not a security boundary. The result is memoized per request.
  const user = await requireUser();

  return <AppShell email={user.email}>{children}</AppShell>;
}
