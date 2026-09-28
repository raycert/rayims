"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { EvidenceList } from "./evidence-list";
import { EvidenceUploader } from "./evidence-uploader";
import type { EvidenceParent } from "@/lib/mutations/evidence";
import type { EvidenceItem } from "@/lib/queries/evidence";

type Common = {
  projectId: string;
  parent: EvidenceParent;
  items: EvidenceItem[];
  editable: boolean;
  /** Shown instead of the uploader when the parent is read-only. */
  lockedReason?: string | null;
  onChanged: (message: string) => void;
};

function Body({ projectId, parent, items, editable, lockedReason, onChanged }: Common) {
  return (
    <div className="space-y-3">
      {editable ? (
        <EvidenceUploader projectId={projectId} parent={parent} onUploaded={onChanged} />
      ) : lockedReason ? (
        <p className="text-sm text-muted">{lockedReason}</p>
      ) : null}
      <EvidenceList projectId={projectId} items={items} editable={editable} onChanged={onChanged} />
    </div>
  );
}

/** Full Evidence section (Finding Detail, Activity Detail). */
export function EvidenceSection(props: Common & { title?: string; description?: string }) {
  const [adding, setAdding] = useState(false);
  return (
    <section data-testid={`evidence-section-${props.parent.kind}`} className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{props.title ?? "Evidence"}</h2>
          {props.description ? <p className="mt-0.5 text-xs text-muted">{props.description}</p> : null}
          <p className="text-xs text-muted">
            {props.items.length} {props.items.length === 1 ? "file" : "files"}
          </p>
        </div>
        {props.editable ? (
          <Button type="button" variant="secondary" className="min-h-9" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            {adding ? "Done" : "Add Evidence"}
          </Button>
        ) : null}
      </div>
      <div className="space-y-3 p-4">
        {props.editable && adding ? (
          <EvidenceUploader
            projectId={props.projectId}
            parent={props.parent}
            onUploaded={(m) => {
              setAdding(false);
              props.onChanged(m);
            }}
          />
        ) : !props.editable && props.lockedReason ? (
          <p className="text-sm text-muted">{props.lockedReason}</p>
        ) : null}
        <EvidenceList projectId={props.projectId} items={props.items} editable={props.editable} onChanged={props.onChanged} />
      </div>
    </section>
  );
}

/**
 * Compact entry point for dense cards (Verification item, Action): "Evidence (N)" opens a
 * drawer / mobile sheet with the uploader and the list — the card itself stays one line taller.
 */
export function EvidenceButton(props: Common & { title: string }) {
  const [open, setOpen] = useState(false);
  const n = props.items.length;
  if (n === 0 && !props.editable) return null;
  return (
    <>
      <button
        type="button"
        data-testid="evidence-button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <Paperclip className="size-4" aria-hidden />
        {n === 0 ? "Add Evidence" : `Evidence (${n})`}
      </button>
      {open ? (
        <Drawer open onClose={() => setOpen(false)} title={props.title}>
          <Body {...props} />
        </Drawer>
      ) : null}
    </>
  );
}
