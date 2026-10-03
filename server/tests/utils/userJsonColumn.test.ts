/**
 * updateUserJson (W8): a compare-and-set write of the JSON settings columns
 * on `User`, so two saves of one column cannot overwrite each other.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../../middleware/errorHandler.js";
import prisma from "../../prisma/singleton.js";
import { logger } from "../../utils/logger.js";
import {
  type UserJsonColumn,
  updateUserJson,
} from "../../utils/userJsonColumn.js";
import { anyOf, objectContaining } from "../helpers/matchers.js";
import { prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockLogger = vi.mocked(logger, true);

/** The read's rows, as the raw query returns them */
function stored(row: Record<string, string | null>) {
  mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([row]);
}

describe("updateUserJson", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("writes only when the text it read is unchanged", async () => {
    stored({ filterPins: '{"scene":{"fields":[],"filters":[]}}' });
    mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1);
    const mutate = vi.fn((values: Record<UserJsonColumn, unknown>) => ({
      ...values,
      filterPins: { tag: { fields: ["a"], filters: [] } },
    }));

    await updateUserJson(7, ["filterPins"], mutate);

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT CAST("filterPins" AS TEXT) AS "filterPins" FROM "User" WHERE "id" = ?',
      7
    );
    expect(mutate).toHaveBeenCalledWith(
      objectContaining({
        filterPins: { scene: { fields: [], filters: [] } },
      })
    );
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'UPDATE "User" SET "filterPins" = ?, "updatedAt" = ? WHERE "id" = ? AND CAST("filterPins" AS TEXT) IS ?',
      '{"tag":{"fields":["a"],"filters":[]}}',
      anyOf(Number),
      7,
      '{"scene":{"fields":[],"filters":[]}}'
    );
  });

  it("re-reads and retries when the row changed, up to 3 times, then throws a ConflictError", async () => {
    mockPrisma.$queryRawUnsafe.mockImplementation(
      prismaImpl(() => Promise.resolve([{ filterPins: null }]))
    );
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    const mutate = vi.fn((values: Record<UserJsonColumn, unknown>) => values);

    const failure = await updateUserJson(7, ["filterPins"], mutate).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(ConflictError);
    expect((failure as ConflictError).statusCode).toBe(409);
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    expect(mutate).toHaveBeenCalledTimes(3);
  });

  it("writes on the second try when the first lost to another save", async () => {
    stored({ filterPins: '{"a":1}' });
    stored({ filterPins: '{"a":2}' });
    mockPrisma.$executeRawUnsafe
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    const mutate = vi.fn((values: Record<UserJsonColumn, unknown>) => ({
      ...values,
      filterPins: { seen: (values.filterPins as { a: number }).a },
    }));

    await updateUserJson(7, ["filterPins"], mutate);

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenLastCalledWith(
      anyOf(String),
      '{"seen":2}',
      anyOf(Number),
      7,
      '{"a":2}'
    );
  });

  it("writes two columns in one statement", async () => {
    stored({ filterPresets: '{"scene":[]}', defaultFilterPresets: null });
    mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1);

    await updateUserJson(
      3,
      ["filterPresets", "defaultFilterPresets"],
      (values) => ({
        ...values,
        filterPresets: { scene: [{ id: "p" }] },
        defaultFilterPresets: { scene: "p" },
      })
    );

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    // a NULL column read binds NULL, which `IS ?` matches
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'UPDATE "User" SET "filterPresets" = ?, "defaultFilterPresets" = ?, "updatedAt" = ? WHERE "id" = ? AND CAST("filterPresets" AS TEXT) IS ? AND CAST("defaultFilterPresets" AS TEXT) IS ?',
      '{"scene":[{"id":"p"}]}',
      '{"scene":"p"}',
      anyOf(Number),
      3,
      '{"scene":[]}',
      null
    );
  });

  it("writes NULL for a column the mutation clears", async () => {
    stored({ filterPins: '{"a":1}' });
    mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1);
    await updateUserJson(3, ["filterPins"], (values) => ({
      ...values,
      filterPins: null,
    }));
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      anyOf(String),
      null,
      anyOf(Number),
      3,
      '{"a":1}'
    );
  });

  it("an unreadable column answers 409 naming it, logs a warning and writes nothing", async () => {
    stored({ filterPresets: "{not json", defaultFilterPresets: null });
    const mutate = vi.fn((values: Record<UserJsonColumn, unknown>) => values);

    const failure = await updateUserJson(
      3,
      ["filterPresets", "defaultFilterPresets"],
      mutate
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConflictError);
    expect((failure as ConflictError).message).toBe(
      "Your saved Views can't be read, so nothing was saved"
    );
    expect(mutate).not.toHaveBeenCalled();
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "A stored settings column can't be read",
      { userId: 3, column: "filterPresets", reset: false }
    );
  });

  it("with resetUnreadable an unreadable column reads as NULL and the write replaces it", async () => {
    stored({ filterPins: "{not json" });
    mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1);
    const mutate = vi.fn((values: Record<UserJsonColumn, unknown>) => values);

    await updateUserJson(3, ["filterPins"], mutate, { resetUnreadable: true });

    expect(mutate).toHaveBeenCalledWith(objectContaining({ filterPins: null }));
    // Compare-and-set on the text read: a save that fixed it meanwhile wins
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
      anyOf(String),
      null,
      anyOf(Number),
      3,
      "{not json"
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "A stored settings column can't be read",
      { userId: 3, column: "filterPins", reset: true }
    );
  });

  it("answers 404 for a user that is gone", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    await expect(
      updateUserJson(9, ["filterPins"], (values) => values)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("sets updatedAt in the form Prisma stores for @updatedAt", async () => {
    // A stored User.updatedAt is an integer of epoch milliseconds (read from
    // a copy of the dev database and of the prod snapshot, typeof integer):
    // the raw write binds a number of that form, so the next prisma.user
    // read parses it as a Date.
    stored({ filterPins: null });
    mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1);
    const before = Date.now();
    await updateUserJson(3, ["filterPins"], (values) => ({
      ...values,
      filterPins: {},
    }));
    const after = Date.now();

    const call = mockPrisma.$executeRawUnsafe.mock.calls[0] as unknown[];
    const updatedAt = call[2];
    expect(Number.isInteger(updatedAt)).toBe(true);
    expect(updatedAt).toBeGreaterThanOrEqual(before);
    expect(updatedAt).toBeLessThanOrEqual(after);
    expect(new Date(updatedAt as number).getTime()).toBe(updatedAt);
  });

  it("a column outside the whitelist is a type error and a thrown error", async () => {
    await expect(
      // @ts-expect-error "password" is no UserJsonColumn
      updateUserJson(3, ["password"], (values) => values)
    ).rejects.toThrow(/column/i);
    await expect(
      // @ts-expect-error a name that would break out of the identifier
      updateUserJson(3, ['filterPins" = 1 --'], (values) => values)
    ).rejects.toThrow(/column/i);
    await expect(updateUserJson(3, [], (values) => values)).rejects.toThrow(
      /column/i
    );
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
