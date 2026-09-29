"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Toast, useToast } from "@/components/ui/toast";
import { documentStatusLabel, documentStatusTone } from "@/lib/ui/status-tones";
import { deleteDocument, getDocumentDeleteState } from "@/lib/mutations/documents";
import { DocumentFormDrawer } from "./document-form-drawer";
import { DocumentVersionsSection } from "./document-versions-section";
import type { DocumentDetail, DocumentFormCatalog } from "@/lib/queries/documents";

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-t border-border px-4 py-2 text-sm first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value ?? <span className="text-muted">—</span>}</span>
    </div>
  );
}

/**
 * Document Detail (Phase 5A foundation): identity, derived status, Framework Requirements and a
 * Versions (upload / view / download / controlled delete, Phase 5B). Reviews arrive in Phase 5C.
 */
export function DocumentDetailView({
  projectName,
  document,
  catalog,
}: {
  projectName: string;
  document: DocumentDetail;
  catalog: DocumentFormCatalog;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { message, show } = useToast();
  const base = `/projects/${document.projectId}`;

  return (
    <div>
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/projects" className="hover:underline">
          Projects
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={base} className="hover:underline">
          {projectName}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`${base}/documents`} className="hover:underline">
          Documents
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{document.title}</span>
      </div>

      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{document.title}</h1>
          {document.docCode ? <div className="mt-0.5 text-sm text-muted">{document.docCode}</div> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            Edit Document
          </Button>
          <OverflowMenu items={[{ label: "Delete Document", onSelect: () => setDeleting(true), danger: true }]} />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <StatusBadge label={documentStatusLabel(document.status)} tone={documentStatusTone(document.status)} />
        <span>·</span>
        <span>{document.siteName ?? "Project-wide"}</span>
      </div>

      <div className="flex max-w-3xl flex-col gap-5">
        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Document Information</h2>
          </div>
          <InfoRow label="Document Code" value={document.docCode} />
          <InfoRow label="Document Type" value={document.documentType} />
          <InfoRow label="Owner" value={document.ownerName} />
          <InfoRow label="Scope" value={document.siteName ?? "Project-wide"} />
          <InfoRow label="Applicability" value={document.isApplicable ? "Applicable" : "Not Applicable"} />
        </section>

        <section data-testid="document-requirements" className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Framework Requirements</h2>
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-primary hover:underline">
              Edit
            </button>
          </div>
          {document.frameworkItems.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">No framework requirements mapped.</p>
          ) : (
            <ul>
              {document.frameworkItems.map((item) => (
                <li key={item.id} className="border-t border-border px-4 py-2 text-sm first:border-t-0">
                  <span className="text-muted">{item.frameworkIdentity} · </span>
                  <span>{item.label}</span>
                  {!item.inAssignedScope ? <span className="ml-1 text-xs text-warning">(not currently assigned)</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <DocumentVersionsSection
          projectId={document.projectId}
          documentId={document.id}
          isApplicable={document.isApplicable}
          versions={document.versions}
          onChanged={(msg) => {
            router.refresh();
            show(msg);
          }}
        />
      </div>

      {editing ? (
        <DocumentFormDrawer
          mode="edit"
          projectId={document.projectId}
          catalog={catalog}
          document={document}
          onClose={() => setEditing(false)}
          onSaved={(msg) => {
            setEditing(false);
            router.refresh();
            show(msg);
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDeleteDialog
          title="Delete Document?"
          message="This permanently removes this Document."
          blockedTitle="This document can't be deleted"
          loadState={() => getDocumentDeleteState(document.projectId, document.id)}
          onDelete={() => deleteDocument(document.projectId, document.id)}
          onClose={() => setDeleting(false)}
          onDeleted={() => router.replace(`${base}/documents`)}
        />
      ) : null}
      <Toast message={message} />
    </div>
  );
}
