/**
 * Integration tests for EntityAccessService against the real test SQLite
 * database (item 6).
 *
 * The fixture seeds entities on three made-up instances (see
 * helpers/accessFixture.ts), so the real sync never touches them. Users:
 * - u: the default hides (SAME@B for every type, GLOBAL everywhere,
 *   HIDDEN_A's performer, tag and image on A)
 * - v: no hides
 * - w: instance-selection parity with getUserAllowedInstanceIds
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  type AccessEntityType,
  canUserAccessEntity,
  getVisibleEntityKeys,
  resolveAccessibleInstanceId,
} from "../../services/EntityAccessService.js";
import {
  getUserAllowedInstanceIds,
  getUsersSelecting,
} from "../../services/UserInstanceService.js";
import { entityKey } from "../../utils/entityRef.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFixtureDefaults,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const SEVEN_TYPES = [
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
] as const satisfies readonly AccessEntityType[];

async function createUser(
  username: string,
  role: "USER" | "ADMIN" = "USER"
): Promise<number> {
  const user = await prisma.user.create({
    data: { username, password: "not-a-real-hash", role },
  });
  return user.id;
}

/** Sets the allow-list flag and the allowed instances (replacing any). */
async function setAccess(
  userId: number,
  limited: boolean,
  allowed: string[]
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { instanceAccessLimited: limited },
  });
  await prisma.userInstanceAccess.deleteMany({ where: { userId } });
  for (const instanceId of allowed) {
    await prisma.userInstanceAccess.create({ data: { userId, instanceId } });
  }
}

describeWithDb("EntityAccessService (integration)", () => {
  let u: number;
  let v: number;
  let w: number;

  beforeAll(async () => {
    await seedAccessFixture();
    u = await createUser("access-it-u");
    v = await createUser("access-it-v");
    w = await createUser("access-it-w");
    await hideFixtureDefaults(u);
  }, 60000);

  afterAll(async () => {
    await clearAccessFixture();
  }, 60000);

  it.each([...SEVEN_TYPES, "clip" as const])(
    "allows SAME on A for every type (%s)",
    async (entityType) => {
      expect(await canUserAccessEntity(u, entityType, FX_ID.SAME, FX.A)).toBe(
        true
      );
    }
  );

  it.each(SEVEN_TYPES)(
    "denies SAME on B where the user hid it, and allows it for a user who did not (%s)",
    async (entityType) => {
      expect(await canUserAccessEntity(u, entityType, FX_ID.SAME, FX.B)).toBe(
        false
      );
      expect(await canUserAccessEntity(v, entityType, FX_ID.SAME, FX.B)).toBe(
        true
      );
    }
  );

  it("applies a legacy global exclusion row to every instance", async () => {
    for (const inst of [FX.A, FX.B]) {
      expect(await canUserAccessEntity(u, "scene", FX_ID.GLOBAL, inst)).toBe(
        false
      );
      expect(await canUserAccessEntity(v, "scene", FX_ID.GLOBAL, inst)).toBe(
        true
      );
    }
  });

  it("denies soft-deleted rows, disabled instances, unknown instances and missing ids", async () => {
    expect(await canUserAccessEntity(v, "scene", FX_ID.DELETED, FX.A)).toBe(
      false
    );
    expect(await canUserAccessEntity(v, "scene", FX_ID.ON_OFF, FX.OFF)).toBe(
      false
    );
    expect(await canUserAccessEntity(v, "scene", FX_ID.SAME, "nope")).toBe(
      false
    );
    expect(await canUserAccessEntity(v, "scene", "9999999", FX.A)).toBe(false);
  });

  it("denies a clip whose scene is hidden, and a clip hidden itself", async () => {
    expect(
      await canUserAccessEntity(u, "clip", FX_ID.CLIP_OF_GLOBAL, FX.A)
    ).toBe(false);
    expect(
      await canUserAccessEntity(v, "clip", FX_ID.CLIP_OF_GLOBAL, FX.A)
    ).toBe(true);

    expect(await canUserAccessEntity(v, "clip", FX_ID.SAME, FX.A)).toBe(true);
    await hideFor(v, "clip", FX_ID.SAME, FX.A);
    try {
      expect(await canUserAccessEntity(v, "clip", FX_ID.SAME, FX.A)).toBe(
        false
      );
    } finally {
      await prisma.userHiddenEntity.deleteMany({ where: { userId: v } });
      await prisma.userExcludedEntity.deleteMany({ where: { userId: v } });
    }
  });

  it("honours the instance selection", async () => {
    await prisma.userStashInstance.create({
      data: { userId: v, instanceId: FX.A },
    });
    try {
      expect(await canUserAccessEntity(v, "scene", FX_ID.B_ONLY, FX.B)).toBe(
        false
      );
      expect(await canUserAccessEntity(v, "scene", FX_ID.SAME, FX.A)).toBe(
        true
      );
    } finally {
      await prisma.userStashInstance.deleteMany({ where: { userId: v } });
    }
  });

  it("denies an instance on its first sync, whatever the user", async () => {
    await prisma.stashInstance.update({
      where: { id: FX.B },
      data: { firstSyncedAt: null },
    });
    try {
      for (const user of [u, v, w]) {
        expect(
          await canUserAccessEntity(user, "scene", FX_ID.B_ONLY, FX.B)
        ).toBe(false);
        expect(
          await getVisibleEntityKeys(user, "scene", [
            { id: FX_ID.SAME, instanceId: FX.A },
            { id: FX_ID.SAME, instanceId: FX.B },
          ])
        ).toEqual(new Set([entityKey(FX_ID.SAME, FX.A)]));
      }
      expect(
        await resolveAccessibleInstanceId(v, "scene", FX_ID.B_ONLY, FX.B)
      ).toBeNull();
    } finally {
      await prisma.stashInstance.update({
        where: { id: FX.B },
        data: { firstSyncedAt: new Date() },
      });
    }
  });

  it("applies an admin's instance allow-list (#439)", async () => {
    const limited = await createUser("access-it-limited");
    const admin = await createUser("access-it-limited-admin", "ADMIN");
    const unlimited = await createUser("access-it-unlimited");
    const refs = [
      { id: FX_ID.SAME, instanceId: FX.A },
      { id: FX_ID.SAME, instanceId: FX.B },
    ];
    try {
      // Limited to A: A yes, B no, by id and in batch
      await setAccess(limited, true, [FX.A]);
      expect(
        await canUserAccessEntity(limited, "scene", FX_ID.SAME, FX.A)
      ).toBe(true);
      expect(
        await canUserAccessEntity(limited, "scene", FX_ID.B_ONLY, FX.B)
      ).toBe(false);
      expect(await getVisibleEntityKeys(limited, "scene", refs)).toEqual(
        new Set([entityKey(FX_ID.SAME, FX.A)])
      );
      expect(
        await resolveAccessibleInstanceId(limited, "scene", FX_ID.B_ONLY, FX.B)
      ).toBeNull();

      // A selection of B cannot widen it: the fallback stays inside A
      await prisma.userStashInstance.create({
        data: { userId: limited, instanceId: FX.B },
      });
      expect(
        await canUserAccessEntity(limited, "scene", FX_ID.SAME, FX.A)
      ).toBe(true);
      expect(
        await canUserAccessEntity(limited, "scene", FX_ID.B_ONLY, FX.B)
      ).toBe(false);
      await prisma.userStashInstance.deleteMany({
        where: { userId: limited },
      });

      // An admin with the flag and rows for A only sees both
      await setAccess(admin, true, [FX.A]);
      expect(await canUserAccessEntity(admin, "scene", FX_ID.SAME, FX.A)).toBe(
        true
      );
      expect(
        await canUserAccessEntity(admin, "scene", FX_ID.B_ONLY, FX.B)
      ).toBe(true);

      // Limited with no rows sees nothing
      await setAccess(limited, true, []);
      for (const ref of refs) {
        expect(
          await canUserAccessEntity(limited, "scene", ref.id, ref.instanceId)
        ).toBe(false);
      }
      expect((await getVisibleEntityKeys(limited, "scene", refs)).size).toBe(0);

      // The flag off: rows are kept but ignored
      await setAccess(unlimited, false, [FX.A]);
      expect(
        await canUserAccessEntity(unlimited, "scene", FX_ID.B_ONLY, FX.B)
      ).toBe(true);
    } finally {
      await prisma.userStashInstance.deleteMany({
        where: { userId: limited },
      });
    }
  });

  it("agrees with getUserAllowedInstanceIds", async () => {
    const probes: [string, string][] = [
      [FX_ID.SAME, FX.A],
      [FX_ID.B_ONLY, FX.B],
      [FX_ID.ON_OFF, FX.OFF],
    ];
    // [FX.OFF] names no enabled instance: every enabled one, as []
    const selections: string[][] = [
      [],
      [FX.A],
      [FX.B],
      [FX.OFF],
      [FX.OFF, FX.B],
    ];

    // [limited, allowed]: unlimited, then every allow-list shape
    const accesses: [boolean, string[]][] = [
      [false, []],
      [false, [FX.A]],
      [true, []],
      [true, [FX.A]],
      [true, [FX.B]],
      [true, [FX.OFF]],
      [true, [FX.A, FX.B]],
      [true, [FX.OFF, FX.B]],
    ];
    const asAdmin = await createUser("access-it-parity-admin", "ADMIN");

    try {
      // B synced, then B on its first sync
      for (const bFirstSyncedAt of [new Date(), null]) {
        await prisma.stashInstance.update({
          where: { id: FX.B },
          data: { firstSyncedAt: bFirstSyncedAt },
        });
        for (const [limited, allowedRows] of accesses) {
          await setAccess(w, limited, allowedRows);
          await setAccess(asAdmin, limited, allowedRows);
          for (const selection of selections) {
            for (const user of [w, asAdmin]) {
              await prisma.userStashInstance.deleteMany({
                where: { userId: user },
              });
              for (const instanceId of selection) {
                await prisma.userStashInstance.create({
                  data: { userId: user, instanceId },
                });
              }
              const allowed = await getUserAllowedInstanceIds(user);

              for (const [id, inst] of probes) {
                expect(
                  await canUserAccessEntity(user, "scene", id, inst),
                  `${user === w ? "user" : "admin"}, limited ${String(limited)} [${allowedRows.join(",")}], B synced ${String(bFirstSyncedAt !== null)}, selection [${selection.join(",")}], ${id}@${inst}`
                ).toBe(allowed.includes(inst));
              }
            }
          }
        }
      }
    } finally {
      await prisma.userStashInstance.deleteMany({
        where: { userId: { in: [w, asAdmin] } },
      });
      await setAccess(w, false, []);
      await prisma.stashInstance.update({
        where: { id: FX.B },
        data: { firstSyncedAt: new Date() },
      });
    }
  });

  it("getUsersSelecting names the users whose scope holds an instance in either enabled state", async () => {
    // Selection -> whether a change to A (enabled, disabled, deleted)
    // changes what w sees: a selection naming A, or naming no other
    // enabled instance (none, or only disabled ones: every enabled one)
    const cases: Array<[string[], boolean]> = [
      [[], true],
      [[FX.A], true],
      [[FX.OFF], true],
      [[FX.OFF, FX.A], true],
      [[FX.B], false],
      [[FX.OFF, FX.B], false],
    ];
    try {
      for (const [selection, affected] of cases) {
        await prisma.userStashInstance.deleteMany({ where: { userId: w } });
        for (const instanceId of selection) {
          await prisma.userStashInstance.create({
            data: { userId: w, instanceId },
          });
        }
        expect(
          (await getUsersSelecting(FX.A)).includes(w),
          `selection [${selection.join(",")}]`
        ).toBe(affected);
      }

      // A limited user allowed only A whose selection names another enabled
      // instance (B) falls back to A, so a change to A affects them
      await setAccess(w, true, [FX.A]);
      await prisma.userStashInstance.deleteMany({ where: { userId: w } });
      await prisma.userStashInstance.create({
        data: { userId: w, instanceId: FX.B },
      });
      expect(await getUserAllowedInstanceIds(w)).toEqual([FX.A]);
      expect((await getUsersSelecting(FX.A)).includes(w)).toBe(true);
      // ... and one not allowed A never sees it, whatever they select
      await setAccess(w, true, [FX.B]);
      expect((await getUsersSelecting(FX.A)).includes(w)).toBe(false);
    } finally {
      await setAccess(w, false, []);
      await prisma.userStashInstance.deleteMany({ where: { userId: w } });
    }
  });

  it("resolveAccessibleInstanceId answers the request's instance only where the user can see the copy", async () => {
    const x = await createUser("access-it-x");
    await hideFor(x, "scene", FX_ID.SAME, FX.A);

    // x hid SAME on A only
    expect(
      await resolveAccessibleInstanceId(x, "scene", FX_ID.SAME, FX.A)
    ).toBeNull();
    expect(
      await resolveAccessibleInstanceId(x, "scene", FX_ID.SAME, FX.B)
    ).toBe(FX.B);
    expect(
      await resolveAccessibleInstanceId(v, "scene", FX_ID.SAME, FX.A)
    ).toBe(FX.A);
    // GLOBAL is hidden for u on every instance.
    expect(
      await resolveAccessibleInstanceId(u, "scene", FX_ID.GLOBAL, FX.A)
    ).toBeNull();
  });

  it("getVisibleEntityKeys returns only the visible refs", async () => {
    const keys = await getVisibleEntityKeys(u, "scene", [
      { id: FX_ID.SAME, instanceId: FX.A },
      { id: FX_ID.SAME, instanceId: FX.B },
      { id: FX_ID.DELETED, instanceId: FX.A },
      { id: FX_ID.ON_OFF, instanceId: FX.OFF },
      { id: FX_ID.GLOBAL, instanceId: FX.A },
      { id: "9999999", instanceId: FX.A },
    ]);

    expect(keys).toEqual(new Set([entityKey(FX_ID.SAME, FX.A)]));
  });

  it("getVisibleEntityKeys handles 5,000 refs in one call", async () => {
    const refs = Array.from({ length: 5000 }, (_, i) => ({
      id: String(8800000 + i),
      instanceId: i % 2 === 0 ? FX.A : FX.B,
    }));
    refs.push({ id: FX_ID.SAME, instanceId: FX.A });

    const keys = await getVisibleEntityKeys(u, "scene", refs);

    expect(keys.size).toBe(1);
    expect(keys.has(entityKey(FX_ID.SAME, FX.A))).toBe(true);
  });
});
