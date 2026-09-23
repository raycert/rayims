import { z } from "zod";

export const frameworkSchema = z.object({
  code: z.string().trim().min(1, "Code is required."),
  edition: z.string().trim().min(1, "Edition is required."),
  name: z.string().trim().min(1, "Name is required."),
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  description: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type FrameworkInput = z.infer<typeof frameworkSchema>;

/**
 * item_type is intentionally NOT here: the normal Add/Edit Item form doesn't expose it
 * (Slice 3 UI polish). createFrameworkItem always assigns "item" directly; updateFrameworkItem
 * never writes the column at all, so a seeded item's real item_type (e.g. "clause") is
 * never touched by an edit through this form.
 */
export const frameworkItemSchema = z.object({
  /** null/undefined = top-level (no parent). */
  parentId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
  code: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  title: z.string().trim().min(1, "Title is required."),
  description: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type FrameworkItemInput = z.infer<typeof frameworkItemSchema>;
