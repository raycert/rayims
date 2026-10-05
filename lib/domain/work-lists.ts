/**
 * "What needs my attention" lists (Phase 7A) shared by the consultant Home and the Project Overview.
 * "Today" is the viewer's local day, which the server cannot know, so the server returns the rows
 * that are certain plus the rows of the two undecided days (see todayBand in lib/ui/business-date),
 * and these pure pickers decide the undecided days with the browser's own today. Nothing else.
 */
import { isActionOverdue } from "@/lib/ui/format";

export type OverdueActionItem = {
  id: string;
  projectId: string;
  projectName: string | null;
  description: string;
  ownerName: string | null;
  dueDate: string;
  priority: string;
  status: string;
  findingId: string | null;
  /** "F-001 · title" of the related Finding; null = standalone Action. */
  findingLabel: string | null;
};

export type OverdueActionsData = {
  /** Overdue whatever the viewer's time zone (due before the day before the server's UTC day) — soonest due first. */
  definite: OverdueActionItem[];
  /** How many Actions are definitely overdue in all (definite holds only the first rows). */
  definiteTotal: number;
  /** Due on the server's UTC day or the day before: overdue only for some viewers. */
  undecided: OverdueActionItem[];
};

export type UpcomingActivityItem = {
  id: string;
  projectId: string;
  projectName: string | null;
  name: string;
  typeLabel: string;
  siteName: string | null;
  status: string;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
};

export type UpcomingActivitiesData = {
  /** Start on the server's UTC day or the day before: upcoming only for some viewers. */
  undecided: UpcomingActivityItem[];
  /** Start after the server's UTC day: upcoming for every viewer — first rows in order. */
  later: UpcomingActivityItem[];
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Overdue Actions for a viewer whose local day is `today`: soonest due first, then priority; with the exact total. */
export function pickOverdueActions(data: OverdueActionsData, today: string, limit: number): { items: OverdueActionItem[]; total: number } {
  const undecidedOverdue = data.undecided.filter((a) => isActionOverdue(a, today));
  const items = [...data.definite, ...undecidedOverdue]
    .sort(
      (a, b) =>
        (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) ||
        (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, limit);
  return { items, total: data.definiteTotal + undecidedOverdue.length };
}

/** Upcoming Activities (start date today or later) for a viewer whose local day is `today`, in plan order. */
export function pickUpcomingActivities(data: UpcomingActivitiesData, today: string, limit: number): UpcomingActivityItem[] {
  return [...data.undecided.filter((a) => a.startDate >= today), ...data.later]
    .sort(
      (a, b) =>
        (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0) ||
        (a.startTime === b.startTime ? 0 : a.startTime === null ? 1 : b.startTime === null ? -1 : a.startTime < b.startTime ? -1 : 1) ||
        a.name.localeCompare(b.name) ||
        (a.id < b.id ? -1 : 1),
    )
    .slice(0, limit);
}
