/**
 * `20260925000200_drop_scene_streams_and_recovery_key` drops two columns kept
 * only for downgrades to 3.3.6 (sweep item 1): `StashScene.streams`, NULL
 * since 3.3.7, and `User.recoveryKey`, where 3.3.6 writes a plaintext key at
 * sign-in. A key found there is newer than the stored hash, so the migration
 * moves it into `recoveryKeyHash` and `hashLegacyRecoveryKeys()` hashes it at
 * the next start.
 *
 * The migration runs on a sandbox database built at the migration before it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { runPrismaCli } from "../../initializers/migrations.js";
import { hashLegacyRecoveryKeys } from "../../initializers/recoveryKeys.js";
import {
  generateRecoveryKey,
  hashRecoveryKey,
  recoveryKeyMatches,
} from "../../utils/recoveryKey.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
} from "../helpers/migrationSandbox.js";

/** The newest migration before the drop */
const BEFORE_DROP = "20260925000100_drop_scene_fts";

async function columnNames(
  client: MigrationSandbox["client"],
  table: string
): Promise<string[]> {
  const rows = await client.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM pragma_table_info(${table}) ORDER BY cid
  `;
  return rows.map((row) => row.name);
}

async function storedHash(
  client: MigrationSandbox["client"],
  id: number
): Promise<string | null> {
  const user = await client.user.findUniqueOrThrow({
    where: { id },
    select: { recoveryKeyHash: true },
  });
  return user.recoveryKeyHash;
}

describe("drop downgrade columns migration", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("drops both columns, and a key 3.3.6 wrote after a downgrade replaces the older hash", async () => {
    const db = await createDatabaseAt(BEFORE_DROP);
    sandbox = db;

    // 3.3.6 run again after a downgrade: a new plaintext key in recoveryKey,
    // the hash from before the downgrade still in recoveryKeyHash
    const oldKey = generateRecoveryKey();
    const downgradeKey = generateRecoveryKey();
    const downgraded = await db.client.user.create({
      data: {
        username: "downgraded",
        password: "x",
        recoveryKeyHash: hashRecoveryKey(oldKey),
      },
    });
    // A user 3.3.6 wrote no key for keeps the hash it has
    const otherKey = generateRecoveryKey();
    const other = await db.client.user.create({
      data: {
        username: "other",
        password: "x",
        recoveryKeyHash: hashRecoveryKey(otherKey),
      },
    });
    await db.client.$executeRaw`
      UPDATE "User" SET "recoveryKey" = ${downgradeKey} WHERE id = ${downgraded.id}
    `;
    await db.client.$executeRaw`
      UPDATE "User" SET "recoveryKey" = '' WHERE id = ${other.id}
    `;
    // A scene row an older version stored with its stream list
    await db.client.stashScene.create({
      data: { id: "1", stashInstanceId: "inst-a", title: "Kept" },
    });
    await db.client.$executeRaw`
      UPDATE "StashScene" SET "streams" = '[{"url":"x?apikey=OLD"}]'
    `;

    await db.client.$disconnect();
    await runPrismaCli(["migrate", "deploy"], {
      prismaDir: PRISMA_DIR,
      databaseUrl: db.url,
    });
    const hashed = await hashLegacyRecoveryKeys(db.client);

    expect(await columnNames(db.client, "User")).not.toContain("recoveryKey");
    expect(await columnNames(db.client, "User")).toContain("recoveryKeyHash");
    expect(await columnNames(db.client, "StashScene")).not.toContain("streams");
    expect(
      await db.client.stashScene.findMany({
        select: { id: true, stashInstanceId: true, title: true },
      })
    ).toEqual([{ id: "1", stashInstanceId: "inst-a", title: "Kept" }]);

    expect(hashed).toBe(1);
    const hash = await storedHash(db.client, downgraded.id);
    expect(hash).toBe(hashRecoveryKey(downgradeKey));
    expect(recoveryKeyMatches(downgradeKey, hash ?? "")).toBe(true);
    expect(recoveryKeyMatches(oldKey, hash ?? "")).toBe(false);
    expect(await storedHash(db.client, other.id)).toBe(
      hashRecoveryKey(otherKey)
    );

    // Idempotent: the next start leaves the hashes alone
    expect(await hashLegacyRecoveryKeys(db.client)).toBe(0);
    expect(await storedHash(db.client, downgraded.id)).toBe(hash);
  });
});
