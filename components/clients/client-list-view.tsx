"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, useToast } from "@/components/ui/toast";
import { clientStatusLabel, clientStatusTone } from "@/lib/ui/status-tones";
import { ClientFormDrawer } from "./client-form-drawer";
import type { ClientListRow } from "@/lib/queries/clients";

type DrawerState = { mode: "create" } | { mode: "edit"; client: ClientListRow } | null;

export function ClientListView({ clients }: { clients: ClientListRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const { message, show } = useToast();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, search]);

  function handleSaved(msg: string) {
    setDrawer(null);
    router.refresh();
    show(msg);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Clients</h1>
          <p className="mt-1 text-sm text-muted">
            {clients.length} {clients.length === 1 ? "client" : "clients"}
          </p>
        </div>
        <Button type="button" onClick={() => setDrawer({ mode: "create" })}>
          + Add Client
        </Button>
      </div>

      <div className="my-4 max-w-xs">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          aria-label="Search clients"
        />
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No clients yet"
            description="Add your first client to start setting up projects and sites."
            action={
              <Button type="button" onClick={() => setDrawer({ mode: "create" })}>
                + Add Client
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title={`No clients match "${search}".`}
            action={
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Clear search
              </button>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface shadow-sm md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Client
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Sites
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Projects
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => router.push(`/clients/${c.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/clients/${c.id}`);
                    }}
                    className="cursor-pointer border-t border-border hover:bg-neutral-soft/60 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
                  >
                    <td className="px-4 py-3 font-semibold">{c.name}</td>
                    <td className="px-2.5 py-3 text-muted">{c.sitesCount}</td>
                    <td className="px-2.5 py-3 text-muted">{c.projectsCount}</td>
                    <td className="px-2.5 py-3">
                      <StatusBadge label={clientStatusLabel(c.status)} tone={clientStatusTone(c.status)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawer({ mode: "edit", client: c });
                        }}
                        className="mr-2.5 text-xs font-semibold text-primary hover:underline"
                      >
                        Edit
                      </button>
                      <span className="text-border">›</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="block rounded-lg border border-border bg-surface p-3.5 shadow-sm"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{c.name}</span>
                  <StatusBadge label={clientStatusLabel(c.status)} tone={clientStatusTone(c.status)} />
                </div>
                <div className="text-[13px] text-muted">
                  {c.sitesCount} sites · {c.projectsCount} projects
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {drawer ? (
        <ClientFormDrawer
          mode={drawer.mode}
          client={drawer.mode === "edit" ? drawer.client : undefined}
          onClose={() => setDrawer(null)}
          onSaved={handleSaved}
        />
      ) : null}
      <Toast message={message} />
    </div>
  );
}
