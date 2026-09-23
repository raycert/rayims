"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { clientSchema } from "@/lib/validation/clients";
import { fieldErrorsFrom, type ActionResult } from "./types";

/** Creates a client. Proxy is not a security boundary, so every Server Action re-verifies. */
export async function createClientRecord(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireUser();

  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.from("clients").insert(parsed.data).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the client. Try again." };

  revalidatePath("/clients");
  return { ok: true, data: { id: data.id } };
}

export async function updateClientRecord(clientId: string, input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createSupabaseClient();
  // .select("id") tells "0 rows matched" (client no longer exists) apart from a real error,
  // instead of silently reporting success for a write that touched nothing.
  const { data, error } = await supabase.from("clients").update(parsed.data).eq("id", clientId).select("id");
  if (error) return { ok: false, error: "Couldn't save the client. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "This client could not be found." };

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, data: undefined };
}
