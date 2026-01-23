-- AlterTable
ALTER TABLE "User" ADD COLUMN "setupCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "setupCompletedAt" DATETIME;
