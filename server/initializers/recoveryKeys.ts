import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { hashRecoveryKey, isRecoveryKeyHash } from "../utils/recoveryKey.js";

/**
 * Hash recovery keys that versions before 3.3.7 stored in plaintext.
 *
 * The migration that renamed `recoveryKey` to `recoveryKeyHash` kept the
 * values; this rewrites every one that is not yet a hash, so existing keys
 * keep working. Idempotent: hashes are left alone.
 */
export async function hashLegacyRecoveryKeys(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { recoveryKeyHash: { not: null } },
    select: { id: true, recoveryKeyHash: true },
  });

  let count = 0;
  for (const { id, recoveryKeyHash } of users) {
    if (!recoveryKeyHash || isRecoveryKeyHash(recoveryKeyHash)) continue;
    await prisma.user.update({
      where: { id },
      data: { recoveryKeyHash: hashRecoveryKey(recoveryKeyHash) },
    });
    count++;
  }

  logger.info("Hashed legacy recovery keys", { count });
  return count;
}
