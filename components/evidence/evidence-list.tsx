"use client";

import { useState, useTransition } from "react";
import { File, FileImage, FileText } from "lucide-react";
import { getEvidenceUrl, removeEvidence } from "@/lib/mutations/evidence";
import { isViewableEvidence } from "@/lib/validation/evidence";
import { formatEvidenceDate, formatFileSize } from "./evidence-format";
import type { EvidenceItem } from "@/lib/queries/evidence";

function Icon({ mimeType }: { mimeType: string | null }) {
  const cls = "size-5 shrink-0 text-muted";
  if (mimeType?.startsWith("image/")) return <FileImage className={cls} aria-hidden />;
  if (mimeType === "application/pdf" || mimeType === "text/plain") return <FileText className={cls} aria-hidden />;
  return <File className={cls} aria-hidden />;
}

/** Evidence rows: metadata, View / Download (signed URL on click), Remove when editable. */
export function EvidenceList({
  projectId,
  items,
  editable,
  onChanged,
}: {
  projectId: string;
  items: EvidenceItem[];
  editable: boolean;
  onChanged: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function open(item: EvidenceItem, mode: "view" | "download") {
    // Open the tab synchronously (popup blockers), then point it at the short-lived URL.
    const win = mode === "view" ? window.open("", "_blank") : null;
    startTransition(async () => {
      const result = await getEvidenceUrl(projectId, item.id, mode);
      if (!result.ok) {
        win?.close();
        setErrors((e) => ({ ...e, [item.id]: result.error }));
        return;
      }
      setErrors((e) => ({ ...e, [item.id]: "" }));
      if (win) win.location.href = result.data.url;
      else window.location.assign(result.data.url);
    });
  }

  function remove(item: EvidenceItem) {
    startTransition(async () => {
      const result = await removeEvidence(projectId, item.id);
      setConfirming(null);
      if (!result.ok) {
        setErrors((e) => ({ ...e, [item.id]: result.error }));
        return;
      }
      onChanged(
        result.data.storedFileRemoved
          ? "Evidence removed"
          : "Evidence removed. The stored file could not be deleted and will need manual cleanup.",
      );
    });
  }

  if (items.length === 0) return <p className="text-sm text-muted">No evidence yet.</p>;

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((item) => (
        <li key={item.id} data-testid="evidence-row" className="px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <Icon mimeType={item.mimeType} />
            <div className="min-w-0 flex-1">
              <p className="break-all text-sm font-semibold">{item.fileName}</p>
              {item.caption ? <p className="text-sm">{item.caption}</p> : null}
              <p className="text-xs text-muted">
                {formatFileSize(item.sizeBytes)} · {item.uploadedByName ?? "Unknown user"} · {formatEvidenceDate(item.uploadedAt)}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {isViewableEvidence(item.mimeType) ? (
                  <button type="button" disabled={pending} onClick={() => open(item, "view")} className="font-semibold text-primary hover:underline">
                    View
                  </button>
                ) : null}
                <button type="button" disabled={pending} onClick={() => open(item, "download")} className="font-semibold text-primary hover:underline">
                  Download
                </button>
                {editable ? (
                  confirming === item.id ? (
                    <span className="flex gap-3">
                      <button type="button" disabled={pending} onClick={() => remove(item)} className="font-semibold text-danger hover:underline">
                        Confirm remove
                      </button>
                      <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="font-semibold text-muted">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => setConfirming(item.id)} className="font-semibold text-muted hover:text-danger">
                      Remove
                    </button>
                  )
                ) : null}
              </div>
              {errors[item.id] ? (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {errors[item.id]}
                </p>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
