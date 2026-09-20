"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/** Shared nav rendering: vertical list (desktop sidebar) or bottom bar (mobile). */
export function NavLinks({ variant }: { variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();
  const bottom = variant === "bottom";

  return (
    <ul className={cn(bottom ? "flex justify-around" : "space-y-1")}>
      {NAV_ITEMS.map(({ href, label, icon: Icon, enabled }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const classes = cn(
          "flex items-center rounded-md text-sm font-medium",
          bottom
            ? "min-h-14 min-w-16 flex-col justify-center gap-0.5 px-2 text-xs"
            : "min-h-11 gap-3 px-3",
          active ? "bg-neutral-soft text-primary" : "text-muted",
          enabled && !active && "hover:bg-neutral-soft hover:text-foreground",
          !enabled && "cursor-not-allowed opacity-50",
        );

        return (
          <li key={href} className={bottom ? "flex-1" : undefined}>
            {enabled ? (
              <Link
                href={href}
                className={classes}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span>{label}</span>
              </Link>
            ) : (
              <span className={classes} aria-disabled="true" title="Coming in a later phase">
                <Icon className="size-5 shrink-0" aria-hidden />
                <span>{label}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
