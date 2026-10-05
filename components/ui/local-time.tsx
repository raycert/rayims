"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

const DATE_ONLY = { day: "numeric", month: "short", year: "numeric" } as const;
const DATE_TIME = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } as const;

/**
 * A TIMESTAMP (a moment: created / closed / reviewed / verified at) in the viewer's own time zone
 * (Phase 7A). The server cannot know that zone, so it renders a hidden UTC placeholder of the same
 * size (no layout shift, no wrong time on screen); after hydration the browser formats the moment
 * itself. Server and first client render agree, so there is no hydration mismatch. Date-only
 * values (due dates, Activity dates) are not moments — they use formatDate.
 */
export function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: "date" | "datetime" }) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const options = mode === "date" ? DATE_ONLY : DATE_TIME;
  const text = new Date(iso).toLocaleString(undefined, mounted ? options : { ...options, timeZone: "UTC" });
  return (
    <time dateTime={iso} className={mounted ? undefined : "invisible"}>
      {text}
    </time>
  );
}
