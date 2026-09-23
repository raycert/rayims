"use client";

import { useCallback, useEffect, useState } from "react";

/** Minimal local toast: no global provider, no dependency. Each page owns its own instance. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2200);
    return () => clearTimeout(timer);
  }, [message]);

  const show = useCallback((next: string) => setMessage(next), []);
  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-white shadow-lg"
    >
      {message}
    </div>
  );
}
