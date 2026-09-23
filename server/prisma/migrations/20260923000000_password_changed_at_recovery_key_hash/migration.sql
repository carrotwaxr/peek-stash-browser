-- Tokens issued before a password change are rejected (sweep item 8)
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" DATETIME;
-- Recovery keys are stored as SHA-256 hex; plaintext values left by older versions are hashed at startup by hashLegacyRecoveryKeys()
ALTER TABLE "User" RENAME COLUMN "recoveryKey" TO "recoveryKeyHash";
