export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
export const TEMPORARY_FAILURE_MESSAGE =
  "We couldn't sign you in right now. Please try again in a moment. If this continues, contact your RayIMS administrator.";

/**
 * Maps a Supabase Auth sign-in error to a user-facing message.
 *
 * Only `invalid_credentials` (wrong password OR unknown email; Supabase returns the
 * same code for both) gets the credentials message. Every other error (network
 * failure, rate limit, server error, unconfirmed or disabled account, ...) gets one
 * generic message, so the response never reveals whether an account exists or why
 * it cannot sign in.
 */
export function signInErrorMessage(error: { code?: string | null }): string {
  return error.code === "invalid_credentials"
    ? INVALID_CREDENTIALS_MESSAGE
    : TEMPORARY_FAILURE_MESSAGE;
}
