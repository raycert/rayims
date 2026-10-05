import { isActionOverdue } from "@/lib/ui/format";

/** The fields the default Action order reads (an ActionRow satisfies it). */
type OrderableAction = {
  id: string;
  status: string;
  dueDate: string | null;
  priority: string;
  createdAt: string;
};

/**
 * Default order (Phase 4D-1): Overdue first, then not-closed before closed, then due date
 * ascending (no due date last), then priority high -> medium -> low, then created_at newest
 * first, then id (deterministic tie breaker). `today` = the viewer's local calendar day (Phase 7A):
 * the server orders with its own estimate, the browser re-orders with the real one.
 */
export function compareActions(a: OrderableAction, b: OrderableAction, today: string): number {
  const aOver = isActionOverdue(a, today);
  const bOver = isActionOverdue(b, today);
  if (aOver !== bOver) return aOver ? -1 : 1;

  const aOpen = a.status !== "closed";
  const bOpen = b.status !== "closed";
  if (aOpen !== bOpen) return aOpen ? -1 : 1;

  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }

  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const aRank = rank[a.priority] ?? 1;
  const bRank = rank[b.priority] ?? 1;
  if (aRank !== bRank) return aRank - bRank;

  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
