/**
 * The deliberate casts tests use for input that breaks its declared type on
 * purpose. Each takes the target type from where its result goes, so its type
 * parameter appears once by design (the lint config exempts this file from
 * `no-unnecessary-type-parameters` for that reason). Request parts use
 * `malformed()` (`controllerTestUtils.ts`).
 */

/**
 * A value passed to the code under test to check its runtime validation: a
 * string where a number belongs, a `null` the type rules out, an object
 * missing a field.
 */
export function untrusted<T>(value: unknown): T {
  return value as T;
}

/**
 * A row the database cannot return, such as a null in a NOT NULL column, for a
 * test of the code's defensive handling of it. Typed as the full row like
 * `partialRow()` (`prismaMock.ts`), but its fields are not checked, so use it
 * only for rows that are invalid on purpose.
 */
export function malformedRow<T>(fields: Record<string, unknown>): T {
  return fields as T;
}
