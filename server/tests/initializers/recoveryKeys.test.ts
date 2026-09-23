/**
 * Unit tests for the startup pass that hashes plaintext recovery keys left by
 * versions before 3.3.7 (sweep item 8).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashLegacyRecoveryKeys } from "../../initializers/recoveryKeys.js";
import prisma from "../../prisma/singleton.js";
import { hashRecoveryKey } from "../../utils/recoveryKey.js";

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma);

describe("hashLegacyRecoveryKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashLegacyRecoveryKeys hashes plaintext keys and leaves hashes alone", async () => {
    const legacyKey = "ABCDEFGHJKMNPQRSTUVWXYZ23456";
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 1, recoveryKeyHash: legacyKey },
      { id: 2, recoveryKeyHash: "a".repeat(64) },
    ] as any);
    mockPrisma.user.update.mockResolvedValue({} as any);

    const count = await hashLegacyRecoveryKeys();

    expect(count).toBe(1);
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { recoveryKeyHash: hashRecoveryKey(legacyKey) },
    });
  });
});
