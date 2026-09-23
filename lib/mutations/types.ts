/** Shared Server Action result shape (never throws to the caller; errors are values). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Collapses a ZodError into { fieldName: firstMessage }, for form field errors. */
export function fieldErrorsFrom(
  error: import("zod").ZodError,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}
