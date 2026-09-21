/** Where a signed-in user lands when no (valid) return path was requested. */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

const MAX_LENGTH = 2000;
// Backslashes and control characters (tab/newline are stripped by URL parsers, so
// "/\t/evil.example" would become "//evil.example").
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;
const LOGIN_PATH = /^\/login(?:[/?]|$)/;

function looksRelative(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !UNSAFE_CHARS.test(path);
}

/**
 * Validates a post-login return path (the `next` parameter). Accepts ONLY a
 * relative path inside RayIMS and returns it normalized (path + query); anything
 * else falls back to DEFAULT_AFTER_LOGIN, so it can never become an open redirect.
 *
 * Rejected: absolute URLs (any scheme), protocol-relative paths ("//host"),
 * backslash / control-character variants (raw or percent-encoded), paths that
 * normalize to protocol-relative ("/..//host"), malformed encodings, overlong
 * values, non-strings, and the login page itself (redirect loop).
 */
export function safeNextPath(input: unknown): string {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_LENGTH) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (!looksRelative(input)) return DEFAULT_AFTER_LOGIN;

  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return DEFAULT_AFTER_LOGIN; // malformed percent-encoding
  }
  if (!looksRelative(decoded)) return DEFAULT_AFTER_LOGIN;

  const base = "http://rayims.invalid";
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== base) return DEFAULT_AFTER_LOGIN;

  // Re-check after normalization: "/..//host" and "/.//host" collapse to "//host".
  const path = url.pathname + url.search;
  if (!looksRelative(path) || LOGIN_PATH.test(path)) return DEFAULT_AFTER_LOGIN;

  return path;
}
