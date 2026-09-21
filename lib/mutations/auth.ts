"use server";

import { redirect } from "next/navigation";
import { signInErrorMessage } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

export type LoginState = { error?: string; email?: string };

/**
 * Email + password sign-in. There is no public sign-up: users are created by an
 * admin (docs/10_RUNBOOK.md). On success the user returns to the requested
 * internal page (`next`), validated here, or to /dashboard.
 */
export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail : "";

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: signInErrorMessage(error), email };

  // The hidden `next` field is user-controlled: always re-validate on the server.
  redirect(safeNextPath(formData.get("next")));
}

/** Ends the session of THIS device only; other devices stay signed in. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
