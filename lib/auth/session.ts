import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  /** auth.users / profiles id. Use it for created_by, verified_by, ... */
  id: string;
  email: string | undefined;
};

/**
 * The signed-in user for the current request, or null.
 *
 * Uses getClaims(), which verifies the JWT signature (never getSession(), which
 * trusts the cookie). Memoized per request, so the layout, pages and Server
 * Actions can all call it without repeating the verification.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };
});

/**
 * Like getCurrentUser(), but redirects to /login when nobody is signed in.
 *
 * Call it at the top of every Server Component tree and Server Action that needs
 * a user: Proxy is not a security boundary (Server Actions are POSTs to a page and
 * can bypass a Proxy matcher), so each server entry point verifies for itself.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
