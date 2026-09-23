"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { Toast, useToast } from "@/components/ui/toast";
import { formatFrameworkIdentity, humanizeCategory } from "@/lib/ui/format";
import { deleteFramework } from "@/lib/mutations/frameworks";
import { FrameworkFormDrawer } from "./framework-form-drawer";
import type { FrameworkListRow } from "@/lib/queries/frameworks";

type DrawerState = { mode: "create" } | { mode: "edit"; framework: FrameworkListRow } | null;
type ConfirmState = "none" | "blocked" | "confirm";

export function FrameworkLibraryView({
  frameworks,
  categories,
  isAdmin,
}: {
  frameworks: FrameworkListRow[];
  categories: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const { message, show } = useToast();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return frameworks;
    return frameworks.filter(
      (f) =>
        f.code.toLowerCase().includes(q) ||
        f.edition.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        (f.category ?? "").toLowerCase().includes(q),
    );
  }, [frameworks, search]);

  function handleSaved(msg: string) {
    setDrawer(null);
    router.refresh();
    show(msg);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Framework Library</h1>
          <p className="mt-1 text-sm text-muted">
            {frameworks.length} {frameworks.length === 1 ? "framework" : "frameworks"} · read-only reference
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" variant="secondary" onClick={() => setDrawer({ mode: "create" })}>
            + New Framework
          </Button>
        ) : null}
      </div>

      <div className="my-4 max-w-xs">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search frameworks…"
          aria-label="Search frameworks"
        />
      </div>

      {frameworks.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title="No frameworks yet"
            description="Add a framework to start building the reference catalog."
            action={
              isAdmin ? (
                <Button type="button" variant="secondary" onClick={() => setDrawer({ mode: "create" })}>
                  + New Framework
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <EmptyState
            title={`No frameworks match "${search}".`}
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
                    Framework
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Category
                  </th>
                  <th className="px-2.5 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-muted">
                    Framework Items
                  </th>
                  <th className="px-4 py-3 text-right text-[13px] font-semibold uppercase tracking-wide text-muted" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((fw) => (
                  <FrameworkRow
                    key={fw.id}
                    framework={fw}
                    isAdmin={isAdmin}
                    onOpen={() => router.push(`/frameworks/${fw.id}`)}
                    onEdit={() => setDrawer({ mode: "edit", framework: fw })}
                    onDeleted={() => {
                      router.refresh();
                      show("Framework deleted");
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {filtered.map((fw) => (
              <Link
                key={fw.id}
                href={`/frameworks/${fw.id}`}
                className="block rounded-lg border border-border bg-surface p-3.5 shadow-sm"
              >
                <div className="text-sm font-semibold">{formatFrameworkIdentity(fw.code, fw.edition)}</div>
                <div className="mt-0.5 text-[12.5px] text-muted">{fw.name}</div>
                <div className="mt-2 flex items-center justify-between">
                  {fw.category ? (
                    <span className="inline-flex items-center rounded bg-neutral-soft px-2 py-0.5 text-[11.5px] font-medium text-foreground">
                      {humanizeCategory(fw.category)}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="text-[12.5px] text-muted">{fw.itemCount} items</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {drawer ? (
        <FrameworkFormDrawer
          mode={drawer.mode}
          framework={drawer.mode === "edit" ? drawer.framework : undefined}
          categories={categories}
          onClose={() => setDrawer(null)}
          onSaved={handleSaved}
        />
      ) : null}
      <Toast message={message} />
    </div>
  );
}

function FrameworkRow({
  framework,
  isAdmin,
  onOpen,
  onEdit,
  onDeleted,
}: {
  framework: FrameworkListRow;
  isAdmin: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [confirmState, setConfirmState] = useState<ConfirmState>("none");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function askDelete() {
    setConfirmState(framework.referenced ? "blocked" : "confirm");
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteFramework(framework.id);
      if (!result.ok) {
        setBlockedMessage(result.error);
        setConfirmState("blocked");
        return;
      }
      onDeleted();
    });
  }

  if (confirmState === "blocked") {
    return (
      <tr className="border-t border-border">
        <td colSpan={4} className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[12.5px] text-warning">
              {blockedMessage ?? "This framework is in use and cannot be deleted."}
            </span>
            <button
              type="button"
              onClick={() => {
                setConfirmState("none");
                setBlockedMessage(null);
              }}
              className="text-[12.5px] font-semibold text-muted"
            >
              OK
            </button>
          </div>
        </td>
      </tr>
    );
  }

  if (confirmState === "confirm") {
    return (
      <tr className="border-t border-border">
        <td colSpan={4} className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[12.5px] text-danger">Delete this framework and all its framework items?</span>
            <button
              type="button"
              onClick={() => setConfirmState("none")}
              disabled={pending}
              className="text-[12.5px] font-semibold text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={pending}
              aria-busy={pending}
              className="rounded-md bg-danger px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="cursor-pointer border-t border-border hover:bg-neutral-soft/60 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
    >
      <td className="px-4 py-3">
        <div className="font-semibold">{formatFrameworkIdentity(framework.code, framework.edition)}</div>
        <div className="text-xs text-muted">{framework.name}</div>
      </td>
      <td className="px-2.5 py-3">
        {framework.category ? (
          <span className="inline-flex items-center rounded bg-neutral-soft px-2 py-0.5 text-[11.5px] font-medium text-foreground">
            {humanizeCategory(framework.category)}
          </span>
        ) : null}
      </td>
      <td className="px-2.5 py-3 text-muted">{framework.itemCount}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        {isAdmin ? (
          <OverflowMenu
            items={[
              { label: "Edit Framework", onSelect: onEdit },
              { label: "Delete Framework", onSelect: askDelete, danger: true },
            ]}
          />
        ) : (
          <span className="text-border">›</span>
        )}
      </td>
    </tr>
  );
}
