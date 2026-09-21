import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_AFTER_LOGIN, safeNextPath } from "@/lib/auth/redirect";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Login URL for an unauthenticated request, carrying the page it wanted as a
 * validated `next` return path (omitted when it is just the default landing page).
 */
function loginUrlFor(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.searchParams.delete("_rsc"); // Next.js internal RSC cache-busting parameter
  const target = safeNextPath(url.pathname + url.search);
  if (url.pathname === "/" || target === DEFAULT_AFTER_LOGIN) return "/login";
  return `/login?next=${encodeURIComponent(target)}`;
}

/**
 * Session handling for proxy.ts (the Next.js 16 name for middleware).
 * Refreshes the auth token, forwards refreshed cookies to Server Components and
 * the browser, and redirects unauthenticated visitors to /login.
 *
 * Uses getClaims(), which verifies the JWT signature; getSession() must never be
 * trusted on the server. Authorization is still checked in the workspace layout
 * because Proxy alone is not a security boundary.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};
  const { url, key } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        cacheHeaders = headers;
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Keep any refreshed session cookies and no-cache headers on the redirect.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    Object.entries(cacheHeaders).forEach(([k, v]) => redirect.headers.set(k, v));
    return redirect;
  };

  if (!isAuthenticated && !isPublicPath(pathname)) return redirectTo(loginUrlFor(request));
  if (isAuthenticated && pathname === "/login") {
    return redirectTo(safeNextPath(request.nextUrl.searchParams.get("next")));
  }

  return response;
}
