-- AlterTable
ALTER TABLE "User" ADD COLUMN "setupCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "setupCompletedAt" DATETIME;

-- Set setupCompleted = true for all existing users (they've already set up their accounts)
UPDATE "User" SET "setupCompleted" = 1, "setupCompletedAt" = CURRENT_TIMESTAMP;
