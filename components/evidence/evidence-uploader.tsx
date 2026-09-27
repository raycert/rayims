"use client";

import { useRef, useState } from "react";
import { Camera, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { getStorage } from "@/lib/storage";
import { checkEvidenceFile, EVIDENCE_ACCEPT } from "@/lib/validation/evidence";
import { prepareEvidenceUpload, registerEvidence, type EvidenceParent } from "@/lib/mutations/evidence";
import { formatFileSize } from "./evidence-format";

/**
 * Single-file Evidence upload (Phase 4E). "Take Photo" uses the normal file input with
 * accept="image/*" + capture (the device decides; no camera API); "Choose File" takes any allowed
 * type. Flow: server validates the parent and returns a key → the browser uploads the bytes to the
 * private bucket under its session → the server registers files + attachments (and removes the
 * object again if registration fails).
 */
export function EvidenceUploader({
  projectId,
  parent,
  onUploaded,
}: {
  projectId: string;
  parent: EvidenceParent;
  onUploaded: (message: string) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(selected: File | undefined) {
    setError(null);
    if (!selected) return;
    const check = checkEvidenceFile({ name: selected.name, size: selected.size, type: selected.type });
    if (!check.ok) {
      setFile(null);
      setError(check.error);
      return;
    }
    setFile(selected);
  }

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const meta = { name: file.name, size: file.size, type: file.type };
      const prepared = await prepareEvidenceUpload(projectId, parent, meta);
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
      const registered = await registerEvidence(projectId, parent, { storageKey: prepared.data.storageKey, ...meta, caption });
      if (!registered.ok) {
        setError(registered.error);
        return;
      }
      setFile(null);
      setCaption("");
      onUploaded("Evidence added");
    } catch {
      setError("The upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="evidence-uploader" className="rounded-md border border-border bg-neutral-soft p-3">
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="evidence-photo-input"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept={EVIDENCE_ACCEPT}
        className="hidden"
        data-testid="evidence-file-input"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="min-h-10" disabled={busy} onClick={() => photoRef.current?.click()}>
          <Camera className="size-4" aria-hidden /> Take Photo
        </Button>
        <Button type="button" variant="secondary" className="min-h-10" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Paperclip className="size-4" aria-hidden /> Choose File
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted">Photo, PDF, Word, Excel, PowerPoint or text · up to 10 MB</p>

      {file ? (
        <div className="mt-3 space-y-2.5">
          <p className="break-all text-sm">
            <span className="font-semibold">{file.name}</span>
            <span className="ml-2 text-muted">{formatFileSize(file.size)}</span>
          </p>
          <div>
            <label htmlFor={`ev-caption-${parent.id}`} className="mb-1 block text-xs font-medium">
              Caption (optional)
            </label>
            <Input
              id={`ev-caption-${parent.id}`}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Chemical storage before correction"
            />
          </div>
          <Button type="button" onClick={() => void upload()} disabled={busy} aria-busy={busy}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
