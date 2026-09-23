"use client";

import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Simple CRUD presentation (05_UI_UX_GUIDELINES): a right-side panel on desktop,
 * a full-screen bottom sheet on mobile. No dependency — plain fixed-position
 * overlay + panel, matching the approved docs/phase-2 reference.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "fixed z-50 flex flex-col bg-surface shadow-xl",
          // desktop: right-side panel
          "inset-y-0 right-0 w-full max-w-[400px]",
          // mobile: full-screen bottom sheet
          "max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:h-[85vh] max-md:max-w-none max-md:rounded-t-2xl",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-8 min-w-8 items-center justify-center rounded-md text-muted hover:bg-neutral-soft hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </>
  );
}
