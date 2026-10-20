import type { Prisma } from "@prisma/client";
import { ValidationError } from "../middleware/errorHandler.js";

/** Call inside the same writer transaction as deletion, demotion or deactivation. */
export async function protectLocalRecovery(
  tx: Prisma.TransactionClient,
  userId: number
): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (user?.role === "ADMIN" && !user.plexOnly && !user.disabled) {
    const others = await tx.user.count({
      where: {
        role: "ADMIN",
        plexOnly: false,
        disabled: false,
        id: { not: userId },
      },
    });
    if (!others)
      throw new ValidationError(
        "Keep a local administrator available for recovery"
      );
  }
}
