"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClientRecord, updateClientRecord } from "@/lib/mutations/clients";

type Existing = { id: string; name: string; status: string; notes: string | null };

const STATUS_OPTIONS = ["active", "inactive"] as const;

export function ClientFormDrawer({
  mode,
  client,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  client?: Existing;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(client?.name ?? "");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>(
    (client?.status as (typeof STATUS_OPTIONS)[number]) ?? "active",
  );
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setNameError(null);
    setFormError(null);
    startTransition(async () => {
      const input = { name, status, notes };
      const result =
        mode === "create"
          ? await createClientRecord(input)
          : await updateClientRecord(client!.id, input);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors?.name) setNameError(result.fieldErrors.name);
        return;
      }
      onSaved(mode === "create" ? "Client created" : "Client updated");
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={mode === "create" ? "Add Client" : "Edit Client"}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="client-name" className="mb-1.5 block text-sm font-medium">
            Client name *
          </label>
          <Input
            id="client-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chinh Long"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "client-name-error" : undefined}
            autoFocus
          />
          {nameError ? (
            <p id="client-name-error" role="alert" className="mt-1.5 text-xs text-danger">
              {nameError}
            </p>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium">Status</span>
          <div className="flex gap-1.5">
            {STATUS_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
                className={cn(
                  "min-h-9 flex-1 rounded-md border text-sm font-medium capitalize",
                  status === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted hover:bg-neutral-soft",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="client-notes" className="mb-1.5 block text-sm font-medium">
            Notes
          </label>
          <Textarea
            id="client-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context for this client"
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
