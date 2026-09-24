import { z } from "zod";

export const ACTIVITY_MODES = ["on_site", "online"] as const;
export const ACTIVITY_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

/** Empty string (an unfilled native date/time input) is treated the same as absent. */
const dateOrTimeField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * "" (unfilled) is treated as not-provided; a provided value must be > 0.
 * The empty string must be intercepted by preprocess BEFORE z.coerce.number() ever
 * runs: Number("") is 0 in JavaScript, not NaN, so inside a union z.coerce.number()
 * would silently "succeed" on "" as 0 and this would never reach a literal("") branch.
 */
const plannedDaysField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().positive({ message: "Planned days must be greater than 0." }).optional(),
);

/** "" (the picker's "Unassigned"/"Project-wide" option) is treated as null, not a value to validate as a uuid. */
const nullableUuid = z
  .union([z.string().uuid("Invalid selection."), z.literal("")])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

type ScheduleShape = {
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
};

/**
 * Simplest consistent V1 date/time rules (Phase 3B-2 review, §12):
 * A. start_time requires start_date.
 * B. end_time requires SOME date context (start_date or end_date) — it does not
 *    force an end_date to be persisted; it's just validated against whichever date
 *    exists, and treated as ending on start_date for a same-day activity.
 * C. end_date >= start_date, when both are set.
 * D. On the same effective day (end_date missing, or end_date === start_date) with
 *    both times set, end_time must be after start_time.
 * E. A multi-day activity (end_date differs from start_date) never compares times
 *    across days — that comparison is skipped entirely.
 */
function refineSchedule(data: ScheduleShape, ctx: z.RefinementCtx) {
  const { startDate, startTime, endDate, endTime } = data;

  if (startTime && !startDate) {
    ctx.addIssue({ code: "custom", path: ["startTime"], message: "Start time requires a start date." });
  }
  if (endTime && !startDate && !endDate) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time requires a date." });
  }
  if (startDate && endDate && endDate < startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date." });
  }

  const effectiveEndDate = endDate ?? startDate;
  const sameDay = !!startDate && effectiveEndDate === startDate;
  if (sameDay && startTime && endTime && endTime <= startTime) {
    ctx.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "End time must be after the start time on the same day.",
    });
  }
}

const scheduleShape = {
  startDate: dateOrTimeField,
  startTime: dateOrTimeField,
  endDate: dateOrTimeField,
  endTime: dateOrTimeField,
  plannedDays: plannedDaysField,
};

/**
 * Status is intentionally NOT part of this schema — a new Activity is always
 * created `planned` server-side (mirrors ADR-017's key-immutability precedent: a
 * field the Create form doesn't even accept as input). Work Performed / Next Steps
 * are Activity Detail -> Outcome concerns, not Create.
 */
export const activityCreateSchema = z
  .object({
    activityTypeId: z.string().uuid("Select an Activity Type."),
    name: z.string().trim().min(1, "Activity Name is required."),
    siteId: nullableUuid,
    mode: z.enum(ACTIVITY_MODES),
    consultantId: nullableUuid,
    objectives: optionalText,
    plannedWork: optionalText,
    ...scheduleShape,
  })
  .superRefine(refineSchedule);

/**
 * Outcome fields (work_performed/next_steps) are included here rather than in a
 * separate schema/form — one Edit Activity drawer, not multiple overlapping edit
 * surfaces. No date-based or status-based restriction on editing them (Phase 3B-2
 * review, §21): a consultant may draft outcome text before or after the planned date.
 */
export const activityUpdateSchema = z
  .object({
    activityTypeId: z.string().uuid("Select an Activity Type."),
    name: z.string().trim().min(1, "Activity Name is required."),
    siteId: nullableUuid,
    mode: z.enum(ACTIVITY_MODES),
    consultantId: nullableUuid,
    status: z.enum(ACTIVITY_STATUSES),
    objectives: optionalText,
    plannedWork: optionalText,
    workPerformed: optionalText,
    nextSteps: optionalText,
    ...scheduleShape,
  })
  .superRefine(refineSchedule);

export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;
