import type { ReactNode } from "react";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

/**
 * Responsive workspace shell: sidebar on desktop (md+), top bar and bottom
 * navigation on mobile/tablet.
 */
export function AppShell({
  email,
  children,
}: {
  email: string | undefined;
  children: ReactNode;
}) {
  return (
    // md:h-dvh pins the shell to exactly the viewport height at desktop, so the content
    // column below (not this outer row) is the thing that scrolls — the sidebar, as a
    // plain stretched flex item that never itself overflows, simply never moves. Mobile
    // keeps its original min-h-dvh whole-page scroll; nothing below md: changes behavior.
    <div className="min-h-dvh md:flex md:h-dvh">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface md:flex">
        <div className="px-5 py-4 text-lg font-semibold tracking-tight">RayIMS</div>
        <nav aria-label="Main" className="flex-1 px-3">
          <NavLinks variant="sidebar" />
        </nav>
        <div className="space-y-1 border-t border-border p-3">
          {email ? (
            <p className="truncate px-3 text-[13px] text-muted" title={email}>
              {email}
            </p>
          ) : null}
          <SignOutButton className="w-full justify-start" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:h-dvh md:overflow-y-auto">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 md:hidden">
          <span className="text-base font-semibold tracking-tight">RayIMS</span>
          <SignOutButton />
        </header>

        {/* pb-24 leaves room for the fixed bottom navigation on mobile */}
        <main className="flex-1 pb-24 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <NavLinks variant="bottom" />
      </nav>
    </div>
  );
}
