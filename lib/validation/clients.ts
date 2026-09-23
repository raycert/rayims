import { z } from "zod";
import { CLIENT_STATUSES } from "@/lib/constants/values";

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required."),
  status: z.enum(CLIENT_STATUSES),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type ClientInput = z.infer<typeof clientSchema>;
