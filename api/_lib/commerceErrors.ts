/** Typed errors for the Commerce BFF — one shape, mapped to HTTP status by
 * the router (`api/commerce/router.ts`) so business logic never touches
 * `res` directly. */

export class CommerceValidationError extends Error {}
export class CommerceConflictError extends Error {}
export class CommerceNotFoundError extends Error {}
export class CommerceForbiddenError extends Error {}

const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_RAISE_EXCEPTION = 'P0001'; // our own tenant-check trigger functions

/** Postgres error code, when the driver's error exposes one. */
function pgCode(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : undefined;
}

/**
 * Translate a raw Postgres constraint violation into the right typed
 * Commerce error, falling back to re-throwing the original (surfaced as a
 * 500) for anything unrecognized — never silently swallowed.
 */
export function translateDbError(err: unknown, fallbackMessage: string): never {
  const code = pgCode(err);
  if (code === PG_UNIQUE_VIOLATION) throw new CommerceConflictError(fallbackMessage);
  if (code === PG_CHECK_VIOLATION) throw new CommerceValidationError(fallbackMessage);
  if (code === PG_FOREIGN_KEY_VIOLATION) throw new CommerceValidationError(fallbackMessage);
  if (code === PG_RAISE_EXCEPTION) throw new CommerceForbiddenError(fallbackMessage);
  throw err;
}
