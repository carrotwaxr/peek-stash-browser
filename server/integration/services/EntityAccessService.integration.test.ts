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
  entityRefKey,
  getVisibleEntityKeys,
  resolveAccessibleInstanceId,
} from "../../services/EntityAccessService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
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

async function createUser(username: string): Promise<number> {
  const user = await prisma.user.create({
    data: { username, password: "not-a-real-hash", role: "USER" },
  });
  return user.id;
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

  it("agrees with getUserAllowedInstanceIds", async () => {
    const probes: [string, string][] = [
      [FX_ID.SAME, FX.A],
      [FX_ID.B_ONLY, FX.B],
      [FX_ID.ON_OFF, FX.OFF],
    ];
    const selections: string[][] = [[], [FX.A], [FX.OFF]];

    try {
      for (const selection of selections) {
        await prisma.userStashInstance.deleteMany({ where: { userId: w } });
        for (const instanceId of selection) {
          await prisma.userStashInstance.create({
            data: { userId: w, instanceId },
          });
        }
        const allowed = await getUserAllowedInstanceIds(w);

        for (const [id, inst] of probes) {
          expect(
            await canUserAccessEntity(w, "scene", id, inst),
            `selection [${selection.join(",")}], ${id}@${inst}`
          ).toBe(allowed.includes(inst));
        }
      }
    } finally {
      await prisma.userStashInstance.deleteMany({ where: { userId: w } });
    }
  });

  it("the legacy guess picks only a copy the user can see", async () => {
    const x = await createUser("access-it-x");
    await hideFor(x, "scene", FX_ID.SAME, FX.A);

    // A comes first by priority, but x hid SAME there.
    expect(
      await resolveAccessibleInstanceId(x, "scene", FX_ID.SAME, undefined)
    ).toBe(FX.B);
    expect(
      await resolveAccessibleInstanceId(v, "scene", FX_ID.SAME, undefined)
    ).toBe(FX.A);
    // GLOBAL is hidden for u on every instance.
    expect(
      await resolveAccessibleInstanceId(u, "scene", FX_ID.GLOBAL, undefined)
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

    expect(keys).toEqual(new Set([entityRefKey(FX_ID.SAME, FX.A)]));
  });

  it("getVisibleEntityKeys handles 5,000 refs in one call", async () => {
    const refs = Array.from({ length: 5000 }, (_, i) => ({
      id: String(8800000 + i),
      instanceId: i % 2 === 0 ? FX.A : FX.B,
    }));
    refs.push({ id: FX_ID.SAME, instanceId: FX.A });

    const keys = await getVisibleEntityKeys(u, "scene", refs);

    expect(keys.size).toBe(1);
    expect(keys.has(entityRefKey(FX_ID.SAME, FX.A))).toBe(true);
  });
});
