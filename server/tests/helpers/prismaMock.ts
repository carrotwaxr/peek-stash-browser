/**
 * Typed deep mock of the Prisma client for unit tests.
 *
 * Every model method and `$` method is a `vi.fn()`, created on first access
 * and typed with vitest's own deep mock types, so
 * `mockPrisma.user.findUnique.mockResolvedValue(...)` is checked against the
 * real Prisma signature. `$transaction` behaves like Prisma's by default: an
 * array of calls resolves with `Promise.all`, a callback runs with the mock.
 *
 * Tests mock the singleton with
 * `vi.mock("../../prisma/singleton.js", () => import("../helpers/prismaSingletonMock.js"))`
 * and read it back with `vi.mocked(prisma, true)`.
 */
import type { PrismaClient } from "@prisma/client";
import { vi } from "vitest";

const deepMocked = (client: PrismaClient) => vi.mocked(client, true);
export type PrismaMock = ReturnType<typeof deepMocked>;

/** An object whose members are created by `make` on first access, then kept. */
function lazyMembers(make: (key: string) => unknown): object {
  const members = new Map<string, unknown>();
  return new Proxy(
    {},
    {
      get(_target, key) {
        // Not thenable: `await`, `Promise.resolve` and module loading must
        // see a plain object, not a promise-like
        if (key === "then" || typeof key === "symbol") return undefined;
        if (!members.has(key)) members.set(key, make(key));
        return members.get(key);
      },
    }
  );
}

export function createPrismaMock(): PrismaMock {
  const client = lazyMembers((key) => {
    if (key === "$transaction") {
      return vi.fn((arg: unknown) =>
        Array.isArray(arg)
          ? Promise.all(arg)
          : (arg as (tx: PrismaMock) => unknown)(client)
      );
    }
    return key.startsWith("$") ? vi.fn() : lazyMembers(() => vi.fn());
  }) as PrismaMock;
  return client;
}

/**
 * A row with only the fields a test needs, typed as the full row. `T` is
 * inferred from where the row goes (for example a mock's `mockResolvedValue`),
 * so unknown columns, wrong value types and bad enum values do not compile.
 */
export function partialRow<T>(fields: Partial<NoInfer<NonNullable<T>>>): T {
  return fields as unknown as T;
}

/**
 * An implementation for a mocked Prisma method (`mockImplementation`) that
 * answers from `impl`, typed from the method: `impl` gets its arguments and
 * returns or resolves its result. A Prisma method returns a `PrismaPromise`,
 * whose query helpers the code under test does not call; a plain promise
 * stands in for it.
 */
export function prismaImpl<F extends (...args: never[]) => unknown>(
  impl: (
    ...args: Parameters<F>
  ) => Awaited<ReturnType<F>> | Promise<Awaited<ReturnType<F>>>
): F {
  const answer = (...args: Parameters<F>) => Promise.resolve(impl(...args));
  // The one cast: a plain promise in place of the PrismaPromise
  return answer as unknown as F;
}

/**
 * A row the database cannot return, such as a null in a NOT NULL column, for a
 * test of the code's defensive handling of it. Typed as the full row like
 * `partialRow`, but its fields are not checked, so use it only for rows that
 * are invalid on purpose (as `malformed()` does for request input).
 */
export function malformedRow<T>(fields: Record<string, unknown>): T {
  return fields as T;
}
