/**
 * The ONE Finding closure rule set (ADR-018, BR-88/BR-99). Pure: used by the server close
 * mutation (on freshly loaded data — never on client-supplied results) and by the pre-close
 * check that feeds the confirmation UI. Not a "use server" module.
 *
 * All types  — hard blocker: any linked action not Closed.
 * Nonconformity — hard blocker: effectiveness_result = not_effective.
 *               — warnings (overridable with an explicit "Close Anyway"): correction blank,
 *                 root cause blank, effectiveness not reviewed.
 * Zero linked actions is allowed (an informational note, not a warning).
 */
export type ClosureInput = {
  findingType: string;
  correction: string | null;
  rootCause: string | null;
  effectivenessResult: string | null;
  actionStatuses: string[];
};

export type ClosureEvaluation = {
  hardBlockers: string[];
  warnings: string[];
  info: string[];
  canClose: boolean;
};

export function evaluateFindingClosure(input: ClosureInput): ClosureEvaluation {
  const isNc = input.findingType === "nonconformity";
  const hardBlockers: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const open = input.actionStatuses.filter((s) => s !== "closed").length;
  if (open > 0) {
    const noun = isNc ? (open === 1 ? "Corrective Action is" : "Corrective Actions are") : open === 1 ? "action is" : "actions are";
    hardBlockers.push(`${open} ${noun} still open.`);
  }

  if (isNc) {
    if (input.effectivenessResult === "not_effective") {
      hardBlockers.push("Effectiveness Review result is Not Effective.");
    }
    if (!input.correction?.trim()) warnings.push("Correction has not been recorded.");
    if (!input.rootCause?.trim()) warnings.push("Root Cause Analysis has not been recorded.");
    if (!input.effectivenessResult) warnings.push("Effectiveness Review has not been completed.");
    if (input.actionStatuses.length === 0) info.push("No corrective actions are recorded.");
  }

  return { hardBlockers, warnings, info, canClose: hardBlockers.length === 0 };
}
