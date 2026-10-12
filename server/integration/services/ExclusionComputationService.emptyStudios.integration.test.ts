/**
 * Integration tests for the empty-studio rule of the exclusion compute.
 *
 * A restriction on a studio covers its descendants, so the studio hierarchy
 * (StashStudio.parentId, same instance) decides emptiness: a studio is empty
 * only when neither it nor any descendant studio, at any depth, has a
 * visible scene or image. A parent whose own scenes are all hidden or
 * restricted stays visible while a child studio has visible content.
 *
 * The studios, scenes and image are seeded under a made-up stashInstanceId
 * so the real sync and other tests never touch them. A full recompute runs
 * the empty phase over the whole test library, hence the 60 s timeouts.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const TEST_INSTANCE = "empty-studio-it-instance";
const TEST_USERNAME = "empty-studio-it-user";

/**
 * The seeded hierarchy:
 * - NETWORK (own scene hidden) with children VAULT (restricted, own scene)
 *   and EXTRA (own visible scene): the defect's shape.
 * - LONELY (no content) with child LONELY_CHILD (own scene hidden).
 * - GRAND (no content) -> MIDDLE (no content) -> LEAF (own visible scene).
 * - PHOTO_PARENT (no content) with child PHOTO_CHILD (one visible image).
 */
const S = {
  NETWORK: "910001",
  VAULT: "910002",
  EXTRA: "910003",
  LONELY: "910004",
  LONELY_CHILD: "910005",
  GRAND: "910006",
  MIDDLE: "910007",
  LEAF: "910008",
  PHOTO_PARENT: "910009",
  PHOTO_CHILD: "910010",
} as const;

const SCENES = {
  NETWORK_OWN: "920001",
  VAULT_OWN: "920002",
  EXTRA_OWN: "920003",
  LONELY_CHILD_OWN: "920004",
  LEAF_OWN: "920005",
} as const;

async function clearTestData(): Promise<void> {
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
  await prisma.stashImage.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
  await prisma.stashStudio.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
  await prisma.stashInstance.deleteMany({ where: { id: TEST_INSTANCE } });
}

/** The user's studio exclusions on the test instance, as id -> reason. */
async function studioReasons(userId: number): Promise<Map<string, string>> {
  const rows = await prisma.userExcludedEntity.findMany({
    where: { userId, entityType: "studio", instanceId: TEST_INSTANCE },
    select: { entityId: true, reason: true },
  });
  return new Map(rows.map((r) => [r.entityId, r.reason]));
}

describeWithDb(
  "ExclusionComputationService empty studios (integration)",
  () => {
    let userId: number;

    beforeAll(async () => {
      // Remove leftovers from an interrupted run; the user cascade clears its rows.
      await prisma.user.deleteMany({ where: { username: TEST_USERNAME } });
      await clearTestData();

      const user = await prisma.user.create({
        data: {
          username: TEST_USERNAME,
          password: "not-a-real-hash",
          role: "USER",
        },
      });
      userId = user.id;

      await prisma.stashInstance.create({
        data: {
          id: TEST_INSTANCE,
          name: TEST_INSTANCE,
          url: `http://${TEST_INSTANCE}.invalid/graphql`,
          apiKey: "x",
          enabled: true,
          firstSyncedAt: new Date(),
        },
      });

      const studio = (id: string, name: string, parentId?: string) => ({
        id,
        stashInstanceId: TEST_INSTANCE,
        name: `${name} (integration)`,
        parentId: parentId ?? null,
      });
      await prisma.stashStudio.createMany({
        data: [
          studio(S.NETWORK, "Network"),
          studio(S.VAULT, "Vault", S.NETWORK),
          studio(S.EXTRA, "Extra", S.NETWORK),
          studio(S.LONELY, "Lonely"),
          studio(S.LONELY_CHILD, "Lonely child", S.LONELY),
          studio(S.GRAND, "Grand"),
          studio(S.MIDDLE, "Middle", S.GRAND),
          studio(S.LEAF, "Leaf", S.MIDDLE),
          studio(S.PHOTO_PARENT, "Photo parent"),
          studio(S.PHOTO_CHILD, "Photo child", S.PHOTO_PARENT),
        ],
      });

      const scene = (id: string, studioId: string) => ({
        id,
        stashInstanceId: TEST_INSTANCE,
        studioId,
      });
      await prisma.stashScene.createMany({
        data: [
          scene(SCENES.NETWORK_OWN, S.NETWORK),
          scene(SCENES.VAULT_OWN, S.VAULT),
          scene(SCENES.EXTRA_OWN, S.EXTRA),
          scene(SCENES.LONELY_CHILD_OWN, S.LONELY_CHILD),
          scene(SCENES.LEAF_OWN, S.LEAF),
        ],
      });
      await prisma.stashImage.create({
        data: {
          id: "930001",
          stashInstanceId: TEST_INSTANCE,
          studioId: S.PHOTO_CHILD,
        },
      });
    }, 60000);

    afterEach(async () => {
      await prisma.userContentRestriction.deleteMany({ where: { userId } });
      await prisma.userHiddenEntity.deleteMany({ where: { userId } });
      await prisma.userExcludedEntity.deleteMany({ where: { userId } });
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { username: TEST_USERNAME } });
      await clearTestData();
    }, 60000);

    /** Restrict VAULT and hide the scenes the hierarchy leaves without content. */
    async function seedExclusions(): Promise<void> {
      await prisma.userContentRestriction.create({
        data: {
          userId,
          entityType: "studios",
          mode: "EXCLUDE",
          entityIds: JSON.stringify([`${S.VAULT}:${TEST_INSTANCE}`]),
        },
      });
      await prisma.userHiddenEntity.createMany({
        data: [SCENES.NETWORK_OWN, SCENES.LONELY_CHILD_OWN].map((entityId) => ({
          userId,
          entityType: "scene",
          entityId,
          instanceId: TEST_INSTANCE,
        })),
      });
    }

    it("a parent with no visible scene of its own stays visible while a child studio has visible scenes", async () => {
      await seedExclusions();

      await exclusionComputationService.recomputeForUser(userId);

      const reasons = await studioReasons(userId);
      expect(reasons.get(S.VAULT)).toBe("restricted");
      expect(reasons.has(S.NETWORK)).toBe(false);
      expect(reasons.has(S.EXTRA)).toBe(false);
    }, 60000);

    it("a parent and its child, both without visible content, are both empty", async () => {
      await seedExclusions();

      await exclusionComputationService.recomputeForUser(userId);

      const reasons = await studioReasons(userId);
      expect(reasons.get(S.LONELY)).toBe("empty");
      expect(reasons.get(S.LONELY_CHILD)).toBe("empty");
    }, 60000);

    it("a visible grandchild keeps its parent and grandparent visible", async () => {
      await seedExclusions();

      await exclusionComputationService.recomputeForUser(userId);

      const reasons = await studioReasons(userId);
      expect(reasons.has(S.GRAND)).toBe(false);
      expect(reasons.has(S.MIDDLE)).toBe(false);
      expect(reasons.has(S.LEAF)).toBe(false);
    }, 60000);

    it("a child studio's visible image keeps its parent visible", async () => {
      await seedExclusions();

      await exclusionComputationService.recomputeForUser(userId);

      const reasons = await studioReasons(userId);
      expect(reasons.has(S.PHOTO_PARENT)).toBe(false);
      expect(reasons.has(S.PHOTO_CHILD)).toBe(false);
    }, 60000);

    it("hiding the only visible leaf empties the whole chain above it", async () => {
      await seedExclusions();
      await prisma.userHiddenEntity.create({
        data: {
          userId,
          entityType: "scene",
          entityId: SCENES.LEAF_OWN,
          instanceId: TEST_INSTANCE,
        },
      });

      await exclusionComputationService.recomputeForUser(userId);

      const reasons = await studioReasons(userId);
      expect(reasons.get(S.GRAND)).toBe("empty");
      expect(reasons.get(S.MIDDLE)).toBe("empty");
      expect(reasons.get(S.LEAF)).toBe("empty");
    }, 60000);
  }
);
