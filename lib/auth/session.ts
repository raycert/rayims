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

export type Role = "admin" | "consultant";

/**
 * The signed-in user's role (`profiles.role`), or null if signed out or the
 * profile lookup fails. Memoized per request. Framework administration is the
 * only place V1 is role-aware (BR-49, amended by BR-52) — pages use this to
 * decide which controls to render; RLS remains the actual authorization.
 */
export const getCurrentUserRole = cache(async (): Promise<Role | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" || data?.role === "consultant" ? data.role : null;
});

/**
 * Like requireUser(), but also requires the Admin role (BR-52 — Framework
 * administration). Returns a rejection instead of throwing/redirecting: callers
 * are Server Actions that surface the error as an ordinary form message. "UI
 * role visibility is not authorization" — RLS is authoritative either way, but
 * this gives a clear message instead of a silent 0-row RLS no-op.
 */
export async function requireAdmin(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; error: string }
> {
  const user = await requireUser();
  const role = await getCurrentUserRole();
  if (role !== "admin") {
    return { ok: false, error: "You don't have permission to do this." };
  }
  return { ok: true, user };
}
