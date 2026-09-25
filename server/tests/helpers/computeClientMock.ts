/**
 * Stand-in for `prisma/computeClient.js` in unit tests. Use it as
 * `vi.mock("../../prisma/computeClient.js", () => import("../helpers/computeClientMock.js"))`,
 * after mocking `prisma/singleton.js`: the compute client is the mocked
 * singleton, so one `fakeRaw` routes the compute's queries whichever client
 * issues them.
 *
 * The stand-ins keep the real helpers' shape (callers one at a time; BEGIN
 * ... COMMIT, ROLLBACK when the body throws), so a test can assert the order
 * of the statements the service issues. The real helpers are covered in
 * `tests/prisma/computeClient.test.ts`.
 */
import type { PrismaClient } from "@prisma/client";
import { vi } from "vitest";
import prisma from "../../prisma/singleton.js";

let tail: Promise<void> = Promise.resolve();

export const getComputeClient = vi.fn(() => Promise.resolve(prisma));

export const disconnectComputeClient = vi.fn(() => Promise.resolve());

export const withComputeConnection = vi.fn(
  async <T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn(prisma);
    } finally {
      release();
    }
  }
);

export const readSnapshot = vi.fn(
  async <T>(
    db: Pick<PrismaClient, "$executeRawUnsafe">,
    fn: () => Promise<T>
  ): Promise<T> => {
    await db.$executeRawUnsafe("BEGIN");
    try {
      const result = await fn();
      await db.$executeRawUnsafe("COMMIT");
      return result;
    } catch (error) {
      await db.$executeRawUnsafe("ROLLBACK");
      throw error;
    }
  }
);
