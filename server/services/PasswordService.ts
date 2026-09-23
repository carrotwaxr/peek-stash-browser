import bcrypt from "bcryptjs";
import prisma from "../prisma/singleton.js";

/** The only writer of User.password after creation. Stamps passwordChangedAt, which ends earlier sessions (auth.ts) and signed media links (item 2). */
export async function setUserPassword(
  userId: number,
  newPassword: string
): Promise<Date> {
  const password = await bcrypt.hash(newPassword, 10);
  const passwordChangedAt = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { password, passwordChangedAt },
  });
  return passwordChangedAt;
}
