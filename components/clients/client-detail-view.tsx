"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast, useToast } from "@/components/ui/toast";
import { clientStatusLabel, clientStatusTone, projectStatusLabel, projectStatusTone } from "@/lib/ui/status-tones";
import { deleteSiteRecord } from "@/lib/mutations/sites";
import { ClientFormDrawer } from "./client-form-drawer";
import { SiteFormDrawer } from "./site-form-drawer";
import { SiteRow } from "./site-row";
import type { ClientDetail, SiteRow as SiteRowData } from "@/lib/queries/clients";

type SiteDrawerState = { mode: "create" } | { mode: "edit"; site: SiteRowData } | null;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ClientDetailView({ client }: { client: ClientDetail }) {
  const router = useRouter();
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [siteDrawer, setSiteDrawer] = useState<SiteDrawerState>(null);
  const { message, show } = useToast();

  function handleClientSaved() {
    setClientDrawerOpen(false);
    router.refresh();
    show("Client updated");
  }

  function handleSiteSaved(msg: string) {
    setSiteDrawer(null);
    router.refresh();
    show(msg);
  }

  async function handleDeleteSite(siteId: string) {
    const result = await deleteSiteRecord(siteId, client.id);
    if (result.ok) {
      router.refresh();
      show("Site removed");
    }
    return result;
  }

  return (
    <div>
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/clients" className="hover:underline">
          Clients
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{client.name}</span>
      </div>

      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{client.name}</h1>
          <StatusBadge label={clientStatusLabel(client.status)} tone={clientStatusTone(client.status)} />
        </div>
        <Button type="button" variant="secondary" onClick={() => setClientDrawerOpen(true)}>
          Edit Client
        </Button>
      </div>
      <p className="mb-6 text-sm text-muted">
        {client.sites.length} {client.sites.length === 1 ? "site" : "sites"} ·{" "}
        {client.projects.length} {client.projects.length === 1 ? "project" : "projects"}
      </p>

      <div className="mb-4 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between px-4 py-3.5">
          <h2 className="text-sm font-semibold">Sites</h2>
          <Button
            type="button"
            variant="secondary"
            className="min-h-8 px-3 text-xs"
            onClick={() => setSiteDrawer({ mode: "create" })}
          >
            + Add Site
          </Button>
        </div>
        {client.sites.length === 0 ? (
          <EmptyState
            title="No sites yet for this client."
            description="Add a site to start defining the client's operating locations."
          />
        ) : (
          client.sites.map((site) => (
            <SiteRow
              key={site.id}
              site={site}
              onEdit={() => setSiteDrawer({ mode: "edit", site })}
              onDelete={() => handleDeleteSite(site.id)}
            />
          ))
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between px-4 py-3.5">
          <h2 className="text-sm font-semibold">Projects</h2>
          <Link href={`/projects/new?clientId=${client.id}`} className={buttonClasses("secondary", "min-h-8 px-3 text-xs")}>
            + New Project
          </Link>
        </div>
        {client.projects.length === 0 ? (
          <div className="px-4 pb-6">
            <p className="text-sm text-muted">No projects yet.</p>
          </div>
        ) : (
          client.projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex min-h-[44px] items-center justify-between gap-3 border-t border-border px-4 py-2 text-sm hover:bg-neutral-soft/60"
            >
              <span className="font-semibold">{p.name}</span>
              <div className="flex items-center gap-2.5 whitespace-nowrap">
                <span className="text-[13px] text-muted">{formatDate(p.startDate)}</span>
                <StatusBadge label={projectStatusLabel(p.status)} tone={projectStatusTone(p.status)} />
              </div>
            </Link>
          ))
        )}
      </div>

      {clientDrawerOpen ? (
        <ClientFormDrawer
          mode="edit"
          client={client}
          onClose={() => setClientDrawerOpen(false)}
          onSaved={handleClientSaved}
        />
      ) : null}
      {siteDrawer ? (
        <SiteFormDrawer
          mode={siteDrawer.mode}
          clientId={client.id}
          site={siteDrawer.mode === "edit" ? siteDrawer.site : undefined}
          onClose={() => setSiteDrawer(null)}
          onSaved={handleSiteSaved}
        />
      ) : null}
      <Toast message={message} />
    </div>
  );
}
