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
      { id: 1, recoveryKey: null, recoveryKeyHash: legacyKey },
      { id: 2, recoveryKey: null, recoveryKeyHash: "a".repeat(64) },
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

  it("moves a plaintext key from the legacy recoveryKey column into recoveryKeyHash and clears it", async () => {
    // A downgrade to 3.3.6 writes a new plaintext key to recoveryKey at
    // sign-in; it is newer than any stored hash, so it wins
    const downgradeKey = "ZYXWVUTSRQPNMKJHGFEDCBA65432";
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 1, recoveryKey: downgradeKey, recoveryKeyHash: "b".repeat(64) },
      { id: 2, recoveryKey: downgradeKey, recoveryKeyHash: null },
      { id: 3, recoveryKey: null, recoveryKeyHash: "c".repeat(64) },
    ] as any);
    mockPrisma.user.update.mockResolvedValue({} as any);

    const count = await hashLegacyRecoveryKeys();

    expect(count).toBe(2);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { recoveryKey: { not: null } },
          { recoveryKeyHash: { not: null } },
        ],
      },
      select: { id: true, recoveryKey: true, recoveryKeyHash: true },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
    for (const id of [1, 2]) {
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id },
        data: {
          recoveryKeyHash: hashRecoveryKey(downgradeKey),
          recoveryKey: null,
        },
      });
    }
  });
});
