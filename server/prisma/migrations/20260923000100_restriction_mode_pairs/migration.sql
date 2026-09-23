-- UserContentRestriction: one row per (user, type, mode) so INCLUDE and EXCLUDE coexist.
-- Every existing row already satisfies the new key (one row per type), so no data changes.
DROP INDEX IF EXISTS "UserContentRestriction_userId_entityType_key";
CREATE UNIQUE INDEX "UserContentRestriction_userId_entityType_mode_key" ON "UserContentRestriction"("userId", "entityType", "mode");
