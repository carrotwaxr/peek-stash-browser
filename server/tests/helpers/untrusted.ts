/**
 * A value that breaks its declared type on purpose, passed to the code under
 * test to check its runtime validation: a string where a number belongs, a
 * `null` the type rules out, an object missing a field. The name marks the
 * input as invalid by design, and this is the one cast tests use for it.
 * Request parts use `malformed()` (`controllerTestUtils.ts`) and database rows
 * `malformedRow()` (`prismaMock.ts`).
 */
export function untrusted<T>(value: unknown): T {
  return value as T;
}
