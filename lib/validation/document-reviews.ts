import { z } from "zod";

/** Stored review statuses (document_reviews CHECK). Under Review = open; the other two are concluded. */
export const CONCLUDED_REVIEW_RESULTS = ["revision_required", "accepted"] as const;

const reviewComments = z
  .string()
  .trim()
  .max(5000, "Keep review comments under 5000 characters.")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** Edit an open Gap Assessment: only the Review Comments change. */
export const reviewCommentsSchema = z.object({ notes: reviewComments });

/** Complete an open Gap Assessment: a result is required (no default) + final Review Comments. */
export const completeReviewSchema = z.object({
  result: z.enum(CONCLUDED_REVIEW_RESULTS, { error: "Choose Revision Required or Accepted." }),
  notes: reviewComments,
});
