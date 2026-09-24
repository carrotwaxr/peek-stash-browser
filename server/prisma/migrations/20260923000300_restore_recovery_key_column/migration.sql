-- Unused since 3.3.7, kept so a downgrade to 3.3.6 can sign in: 3.3.6 reads and
-- writes "recoveryKey" at login (sweep item 8 renamed it to "recoveryKeyHash").
-- hashLegacyRecoveryKeys() moves any plaintext key 3.3.6 wrote here into
-- "recoveryKeyHash" at startup. PR 3 drops it with item 17's pre-migration backup.
ALTER TABLE "User" ADD COLUMN "recoveryKey" TEXT;
