/**
 * Stand-in for `prisma/computeClient.js` in unit tests. Use it as
 * `vi.mock("../../prisma/computeClient.js", () => import("../helpers/computeClientMock.js"))`,
 * after mocking `prisma/singleton.js`: the compute client is the mocked
 * singleton, so one `fakeRaw` routes the compute's queries whichever client
 * issues them.
 *
 * The stand-ins keep the real helpers' shape (callers one at a time through
 * the real serial queue, a nested caller failing fast; BEGIN ... COMMIT,
 * ROLLBACK when the body throws), so a test can assert the order of the
 * statements the service issues. The real helpers are covered in
 * `tests/prisma/computeClient.test.ts`.
 */
import type { PrismaClient } from "@prisma/client";
import { vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { createSerialQueue } from "../../utils/serialQueue.js";

const computeQueue = createSerialQueue({ name: "withComputeConnection" });

export const getComputeClient = vi.fn(() => Promise.resolve(prisma));

export const disconnectComputeClient = vi.fn(() => Promise.resolve());

export const withComputeConnection = vi.fn(
  <T>(fn: (db: PrismaClient) => Promise<T>, label = "compute"): Promise<T> =>
    computeQueue.run(label, () => fn(prisma))
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
