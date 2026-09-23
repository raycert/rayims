"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createSiteRecord, updateSiteRecord } from "@/lib/mutations/sites";
import type { SiteRow } from "@/lib/queries/clients";

export function SiteFormDrawer({
  mode,
  clientId,
  site,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  /** Trusted: the site always belongs to this client. There is no client selector here. */
  clientId: string;
  site?: SiteRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(site?.name ?? "");
  const [address, setAddress] = useState(site?.address ?? "");
  const [notes, setNotes] = useState(site?.notes ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setNameError(null);
    setFormError(null);
    startTransition(async () => {
      const input = { name, address, notes };
      const result =
        mode === "create"
          ? await createSiteRecord(clientId, input)
          : await updateSiteRecord(site!.id, clientId, input);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors?.name) setNameError(result.fieldErrors.name);
        return;
      }
      onSaved(mode === "create" ? "Site added" : "Site updated");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={mode === "create" ? "Add Site" : "Edit Site"}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : mode === "create" ? "Add" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="site-name" className="mb-1.5 block text-sm font-medium">
            Site name *
          </label>
          <Input
            id="site-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Viet Long"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "site-name-error" : undefined}
            autoFocus
          />
          {nameError ? (
            <p id="site-name-error" role="alert" className="mt-1.5 text-xs text-danger">
              {nameError}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="site-address" className="mb-1.5 block text-sm font-medium">
            Address
          </label>
          <Input
            id="site-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div>
          <label htmlFor="site-notes" className="mb-1.5 block text-sm font-medium">
            Notes
          </label>
          <Textarea
            id="site-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            rows={3}
          />
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
