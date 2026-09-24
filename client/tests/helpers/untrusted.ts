/**
 * The deliberate cast tests use for input that breaks its declared type on
 * purpose, as on the server (`server/tests/helpers/untrusted.ts`). It takes the
 * target type from where its result goes, so its type parameter appears once
 * by design (the lint config exempts this file from
 * `no-unnecessary-type-parameters` for that reason).
 */

/**
 * A value passed to the code under test to check its runtime handling of bad
 * input: a `null` or `undefined` the type rules out, a string where a number
 * belongs, an object missing a field.
 */
export function untrusted<T>(value: unknown): T {
  return value as T;
}
