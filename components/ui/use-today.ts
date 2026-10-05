"use client";

import { useSyncExternalStore } from "react";
import { dateInZone, utcToday } from "@/lib/ui/business-date";

/**
 * The viewer's local calendar day (YYYY-MM-DD) — what "today" means for every business-date rule
 * (overdue, upcoming; Phase 7A). Server render and hydration use the server's UTC day, then the
 * browser switches to its own day without a hydration mismatch (useSyncExternalStore). It re-reads
 * when the tab becomes visible again and once a minute, so a page left open over midnight corrects.
 */
function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

export function useToday(): string {
  return useSyncExternalStore(
    subscribe,
    () => dateInZone(new Date()),
    () => utcToday(),
  );
}
