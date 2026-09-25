/**
 * Unit tests for the startup pass that hashes plaintext recovery keys left by
 * versions before 3.3.7 (sweep item 8).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashLegacyRecoveryKeys } from "../../initializers/recoveryKeys.js";
import prisma from "../../prisma/singleton.js";
import { hashRecoveryKey } from "../../utils/recoveryKey.js";
import { userRow } from "../helpers/fixtures.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);

describe("hashLegacyRecoveryKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashLegacyRecoveryKeys hashes plaintext keys and leaves hashes alone", async () => {
    const legacyKey = "ABCDEFGHJKMNPQRSTUVWXYZ23456";
    mockPrisma.user.findMany.mockResolvedValue([
      partialRow({ id: 1, recoveryKeyHash: legacyKey }),
      partialRow({ id: 2, recoveryKeyHash: "a".repeat(64) }),
    ]);
    mockPrisma.user.update.mockResolvedValue(userRow());

    const count = await hashLegacyRecoveryKeys();

    expect(count).toBe(1);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { recoveryKeyHash: { not: null } },
      select: { id: true, recoveryKeyHash: true },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { recoveryKeyHash: hashRecoveryKey(legacyKey) },
    });
  });
});
