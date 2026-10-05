/**
 * PostgreSQL error classes the application turns into plain messages (Phase 7B). The database is the
 * final guarantee behind several application checks; when a concurrent change slips between a check and
 * the write, the database refuses and these helpers recognise it. Constraint names and raw database text
 * are never shown to the user.
 */
type DbError = { code?: string | null } | null | undefined;

/**
 * A DELETE refused because rows still reference the target: ON DELETE RESTRICT raises 23001
 * (restrict_violation), a plain foreign-key violation raises 23503 (foreign_key_violation).
 */
export function isReferencedRowViolation(error: DbError): boolean {
  return error?.code === "23001" || error?.code === "23503";
}

/** A unique constraint / index refused the write (23505), e.g. a second open Gap Assessment of one Version. */
export function isUniqueViolation(error: DbError): boolean {
  return error?.code === "23505";
}
