import type { PrismaClient } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { hashRecoveryKey, isRecoveryKeyHash } from "../utils/recoveryKey.js";

/**
 * Hash recovery keys stored in plaintext in `recoveryKeyHash`.
 *
 * Two migrations leave them there:
 * - the one that renamed `recoveryKey` to `recoveryKeyHash` for 3.3.7 kept
 *   the values;
 * - `20260925000200_drop_scene_streams_and_recovery_key` moved in any key
 *   3.3.6 wrote to `recoveryKey` after a downgrade, since that key is newer
 *   than the stored hash.
 *
 * Existing keys keep working. Idempotent: hashes are left alone.
 */
export async function hashLegacyRecoveryKeys(
  client: PrismaClient = prisma
): Promise<number> {
  const users = await client.user.findMany({
    where: { recoveryKeyHash: { not: null } },
    select: { id: true, recoveryKeyHash: true },
  });

  let count = 0;
  for (const { id, recoveryKeyHash } of users) {
    if (!recoveryKeyHash || isRecoveryKeyHash(recoveryKeyHash)) continue;
    await client.user.update({
      where: { id },
      data: { recoveryKeyHash: hashRecoveryKey(recoveryKeyHash) },
    });
    count++;
  }

  logger.info("Hashed legacy recovery keys", { count });
  return count;
}
