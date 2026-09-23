import { z } from "zod";

export const siteSchema = z.object({
  name: z.string().trim().min(1, "Site name is required."),
  address: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type SiteInput = z.infer<typeof siteSchema>;
