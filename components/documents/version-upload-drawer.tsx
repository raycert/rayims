"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { openNativePicker } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getStorage } from "@/lib/storage";
import { checkDocumentVersionFile, DOCUMENT_VERSION_ACCEPT } from "@/lib/validation/document-versions";
import { prepareDocumentVersionUpload, registerDocumentVersion } from "@/lib/mutations/document-versions";
import { formatFileSize } from "@/components/evidence/evidence-format";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-xs text-danger">
      {message}
    </p>
  ) : null;
}

/**
 * Upload New Version (Phase 5B). The same flow for V1 and later versions: the server validates
 * the Document and returns a key → the browser uploads the bytes directly to the private bucket →
 * the server registers `files` + `document_versions` (version_no assigned there). A Version is
 * immutable afterwards, so this is the only form.
 */
export function VersionUploadDrawer({
  projectId,
  documentId,
  nextVersionNo,
  onClose,
  onUploaded,
}: {
  projectId: string;
  documentId: string;
  nextVersionNo: number;
  onClose: () => void;
  onUploaded: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [revision, setRevision] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(selected: File | undefined) {
    setError(null);
    setFieldErrors((e) => ({ ...e, file: "" }));
    if (!selected) return setFile(null);
    const check = checkDocumentVersionFile({ name: selected.name, size: selected.size, type: selected.type });
    if (!check.ok) {
      setFile(null);
      setFieldErrors((e) => ({ ...e, file: check.error }));
      return;
    }
    setFile(selected);
  }

  async function upload() {
    if (busy) return;
    if (!file) {
      setFieldErrors((e) => ({ ...e, file: "Choose a file." }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const meta = { name: file.name, size: file.size, type: file.type };
      const prepared = await prepareDocumentVersionUpload(projectId, documentId, meta);
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }
      try {
        await getStorage(createClient()).upload(prepared.data.storageKey, file, { contentType: prepared.data.contentType });
      } catch {
        setError("The upload failed. Check your connection and try again.");
        return;
      }
      const registered = await registerDocumentVersion(projectId, documentId, {
        storageKey: prepared.data.storageKey,
        ...meta,
        revision,
        receivedOn,
        notes,
      });
      if (!registered.ok) {
        setError(registered.error);
        setFieldErrors(registered.fieldErrors ?? {});
        return;
      }
      onUploaded("Version uploaded.");
    } catch {
      setError("The upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={busy ? () => {} : onClose}
      title="Upload New Version"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void upload()} disabled={busy} aria-busy={busy}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          This will be <span className="font-semibold text-foreground">V{nextVersionNo}</span>. A version can&apos;t be edited later —
          if something is wrong, delete it (while unreviewed) and upload again.
        </p>

        <div>
          <label htmlFor="ver-file" className="mb-1.5 block text-sm font-medium">
            File *
          </label>
          <input
            id="ver-file"
            type="file"
            accept={DOCUMENT_VERSION_ACCEPT}
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
            aria-invalid={fieldErrors.file ? true : undefined}
            className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:text-sm file:font-medium hover:file:bg-neutral-soft"
          />
          <p className="mt-1.5 text-xs text-muted">PDF, Word, Excel or PowerPoint · up to 10 MB</p>
          {file ? (
            <p data-testid="selected-file" className="mt-1.5 break-all text-sm">
              <span className="font-semibold">{file.name}</span>
              <span className="ml-2 text-muted">{formatFileSize(file.size)}</span>
            </p>
          ) : null}
          <FieldError message={fieldErrors.file} />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="ver-revision" className="mb-1.5 block text-sm font-medium">
              Revision
            </label>
            <Input id="ver-revision" value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="e.g. Rev.01" disabled={busy} />
            <FieldError message={fieldErrors.revision} />
          </div>
          <div>
            <label htmlFor="ver-received" className="mb-1.5 block text-sm font-medium">
              Received on
            </label>
            <Input
              id="ver-received"
              type="date"
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
              onClick={openNativePicker}
              disabled={busy}
            />
            <FieldError message={fieldErrors.receivedOn} />
          </div>
        </div>

        <div>
          <label htmlFor="ver-notes" className="mb-1.5 block text-sm font-medium">
            Notes
          </label>
          <Textarea
            id="ver-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Signed copy provided after the document-control workshop"
            disabled={busy}
          />
          <FieldError message={fieldErrors.notes} />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
