import { expect, test } from "@playwright/test";
import { devStack } from "./env";

/**
 * A test's subject from the library: a scene, a performer with images, a
 * second page of results.
 *
 * Hermetic runs sync item 83's replay library, which holds every subject the
 * specs need, so a missing one fails the test. On the dev stack the library
 * is whatever that Stash holds, so a missing one skips the test.
 *
 * `what` names the subject: "the replay library has <what>" on failure,
 * "no <what> in this library" on a skip.
 */
export function requireData<T>(value: T | null | undefined, what: string): T {
  if (devStack) {
    test.skip(!value, `no ${what} in this library`);
  } else {
    expect(value, `the replay library has ${what}`).toBeTruthy();
  }
  // Either call above ends the test when the value is missing
  return value as T;
}
