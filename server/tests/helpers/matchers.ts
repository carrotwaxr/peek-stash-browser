/**
 * Typed stand-ins for vitest's asymmetric matchers, which are typed `any`.
 *
 * Each matches exactly as the vitest matcher it wraps, and is typed as the
 * value it stands in for, so it can sit inside a typed object (a Prisma
 * `data` argument, a response body) without an `any` leaking into it. With a
 * type argument, the fields are checked: `objectContaining<Prisma.UserUpdateInput>({ role: "USER" })`.
 */
import { expect } from "vitest";

/** `expect.objectContaining`: an object with at least these fields. */
export function objectContaining<T>(expected: Partial<T>): T {
  return expect.objectContaining<unknown>(expected) as T;
}

/** `expect.arrayContaining`: an array holding at least these elements. */
export function arrayContaining<T>(expected: readonly T[]): T[] {
  const elements: unknown[] = [...expected];
  return expect.arrayContaining(elements) as T[];
}

/** `expect.stringContaining`: a string that contains `expected`. */
export function stringContaining(expected: string): string {
  return expect.stringContaining(expected) as string;
}

/**
 * `expect.any(constructor)`: any value made by the constructor, or for
 * `String`, `Number` and `Boolean` any value of the primitive type.
 */
export function anyOf(constructor: StringConstructor): string;
export function anyOf(constructor: NumberConstructor): number;
export function anyOf(constructor: BooleanConstructor): boolean;
export function anyOf<T>(constructor: abstract new (...args: never[]) => T): T;
export function anyOf(constructor: unknown): unknown {
  return expect.any(constructor) as unknown;
}
