/**
 * Controlled delete rules (Phase 4F). Pure evaluators shared by the "can this be deleted?" check
 * and the delete mutations, which always re-load authoritative state first. Deletion is only for
 * mistaken / unused records: anything carrying work history (execution, closure, linked records,
 * evidence) is retained. Nothing is ever cascaded to make a record deletable.
 */
export type DeleteEvaluation = { canDelete: boolean; blockers: string[] };

const done = (blockers: string[]): DeleteEvaluation => ({ canDelete: blockers.length === 0, blockers });

export function evaluateVerificationDelete(v: {
  result: string | null;
  notes: string | null;
  verifiedActivityId: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  findingCount: number;
  evidenceCount: number;
}): DeleteEvaluation {
  const blockers: string[] = [];
  const executed = !!v.result || !!v.notes?.trim() || !!v.verifiedActivityId || !!v.verifiedBy || !!v.verifiedAt;
  if (executed) blockers.push("This verification has execution history and cannot be deleted.");
  if (v.findingCount > 0) blockers.push("This verification has linked Findings and cannot be deleted.");
  if (v.evidenceCount > 0) blockers.push("This verification has Evidence and cannot be deleted.");
  return done(blockers);
}

export function evaluateFindingDelete(f: { status: string; actionCount: number; evidenceCount: number }): DeleteEvaluation {
  const blockers: string[] = [];
  if (f.status === "closed") {
    blockers.push("Closed Findings are retained as project history. Reopen it if you need to continue working on it.");
  }
  if (f.actionCount > 0) blockers.push("This Finding has linked Actions and cannot be deleted.");
  if (f.evidenceCount > 0) blockers.push("This Finding has Evidence and cannot be deleted. Remove the Evidence first if it was added by mistake.");
  return done(blockers);
}

/** Phase 5A: only a Document with no Versions. Framework mappings are setup data and do not block. */
export function evaluateDocumentDelete(d: { versionCount: number }): DeleteEvaluation {
  const blockers: string[] = [];
  if (d.versionCount > 0) blockers.push("This document has versions and cannot be deleted.");
  return done(blockers);
}

export function evaluateActionDelete(a: { status: string; findingStatus: string | null; evidenceCount: number }): DeleteEvaluation {
  const blockers: string[] = [];
  if (a.findingStatus === "closed") blockers.push("This Action belongs to a closed Finding. Reopen the Finding first.");
  if (a.status === "closed") blockers.push("Closed Actions are retained as project history.");
  if (a.evidenceCount > 0) blockers.push("This Action has Evidence and cannot be deleted. Remove the Evidence first if it was added by mistake.");
  return done(blockers);
}
