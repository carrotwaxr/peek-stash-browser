/**
 * The value, or a thrown error naming what was missing.
 *
 * For index access a test relies on, such as `must(result[0]).id` or
 * `must(mock.calls[0])[0]`: a missing element fails the test with a clear
 * message instead of a TypeError, and never lets it pass silently the way
 * `?.` inside `expect(...)` would. Falsy values such as `0` and `""` are
 * returned as they are.
 */
export function must<T>(value: T | null | undefined, what = "value"): T {
  if (value === undefined || value === null) {
    throw new Error(`expected ${what} to be present`);
  }
  return value;
}
