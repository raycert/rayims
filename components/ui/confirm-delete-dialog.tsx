"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { DeleteEvaluation } from "@/lib/domain/delete-rules";
import type { ActionResult } from "@/lib/mutations/types";

/**
 * Controlled-delete confirmation (Phase 4F). Loads the server's current delete evaluation first:
 * when blocked it lists every reason and offers only Close; otherwise it asks for confirmation
 * with a destructive Delete. The delete mutation re-checks on the server, so a stale view can
 * never delete a record that has since gained history.
 */
export function ConfirmDeleteDialog({
  title,
  message,
  blockedTitle,
  loadState,
  onDelete,
  onClose,
  onDeleted,
}: {
  title: string;
  message: string;
  blockedTitle: string;
  loadState: () => Promise<ActionResult<DeleteEvaluation>>;
  onDelete: () => Promise<ActionResult<DeleteEvaluation>>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const titleId = useId();
  const [state, setState] = useState<DeleteEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Load once when opened (the dialog is mounted per request).
  const loadRef = useRef(loadState);

  useEffect(() => {
    let active = true;
    loadRef.current().then((r) => {
      if (!active) return;
      if (r.ok) setState(r.data);
      else setError(r.error);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture phase + stop: Escape closes only this dialog, not a drawer underneath it.
      e.stopPropagation();
      if (!pending) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, pending]);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const r = await onDelete();
      if (!r.ok) {
        // The record may have changed since the dialog opened: show the current blockers.
        const fresh = await loadRef.current();
        if (fresh.ok && !fresh.data.canDelete) {
          setState(fresh.data);
        } else {
          setError(r.error);
        }
        return;
      }
      onDeleted();
    });
  }

  const blocked = state ? !state.canDelete : false;

  return (
    <>
      <div className="fixed inset-0 z-[55] bg-black/30" onClick={pending ? undefined : onClose} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="delete-dialog"
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[56] w-full bg-surface p-5 shadow-xl max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-2xl max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg"
      >
        <h2 id={titleId} className="text-base font-semibold">
          {blocked ? blockedTitle : title}
        </h2>
        {!state && !error ? (
          <p className="mt-2 text-sm text-muted">Checking…</p>
        ) : blocked ? (
          <ul data-testid="delete-blockers" className="mt-3 space-y-1.5 text-sm">
            {state!.blockers.map((b) => (
              <li key={b} className="rounded-md bg-neutral-soft px-3 py-2">
                {b}
              </li>
            ))}
          </ul>
        ) : state ? (
          <p className="mt-2 text-sm text-muted">{message}</p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button autoFocus type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {blocked || (!state && error) ? "Close" : "Cancel"}
          </Button>
          {state?.canDelete ? (
            <Button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              aria-busy={pending}
              className="bg-danger! text-white hover:bg-danger/90!"
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}
