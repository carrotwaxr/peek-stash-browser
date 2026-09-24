import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { hashRecoveryKey, isRecoveryKeyHash } from "../utils/recoveryKey.js";

/**
 * Hash recovery keys that versions before 3.3.7 stored in plaintext.
 *
 * Two sources:
 * - `recoveryKeyHash` holding a plaintext key: the migration that renamed
 *   `recoveryKey` to `recoveryKeyHash` kept the values.
 * - `recoveryKey` holding a plaintext key: 3.3.6, run again after a downgrade,
 *   writes a new key there at sign-in. That key is newer than any stored hash,
 *   so it replaces the hash and the column is cleared.
 *
 * Existing keys keep working. Idempotent: hashes are left alone.
 */
export async function hashLegacyRecoveryKeys(): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ recoveryKey: { not: null } }, { recoveryKeyHash: { not: null } }],
    },
    select: { id: true, recoveryKey: true, recoveryKeyHash: true },
  });

  let moved = 0;
  let hashed = 0;
  for (const { id, recoveryKey, recoveryKeyHash } of users) {
    if (recoveryKey) {
      await prisma.user.update({
        where: { id },
        data: {
          recoveryKeyHash: hashRecoveryKey(recoveryKey),
          recoveryKey: null,
        },
      });
      moved++;
    } else if (recoveryKeyHash && !isRecoveryKeyHash(recoveryKeyHash)) {
      await prisma.user.update({
        where: { id },
        data: { recoveryKeyHash: hashRecoveryKey(recoveryKeyHash) },
      });
      hashed++;
    }
  }

  logger.info("Hashed legacy recovery keys", { hashed, moved });
  return hashed + moved;
}
