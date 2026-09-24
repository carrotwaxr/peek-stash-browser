/**
 * Ratings and Sync to Stash over HTTP (item 6).
 *
 * A rating or favorite is stored only for an entity the user can see: not
 * hidden or restricted for them, not deleted, and on an enabled instance
 * they use. Only an admin can switch Sync to Stash.
 *
 * The rater hides the fixture defaults (see helpers/accessFixture.ts): SAME
 * on B for every type, GLOBAL on every instance, HIDDEN_A on A.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFixtureDefaults,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient } from "../helpers/testClient.js";

const RATED_TYPES = [
  "scene",
  "performer",
  "studio",
  "tag",
  "gallery",
  "group",
  "image",
] as const;
type RatedType = (typeof RATED_TYPES)[number];

/** The rater's rating row for this type on instance B, if any. */
async function findRatingOnB(type: RatedType, userId: number) {
  const where = { userId, instanceId: FX.B };
  switch (type) {
    case "scene":
      return prisma.sceneRating.findFirst({ where });
    case "performer":
      return prisma.performerRating.findFirst({ where });
    case "studio":
      return prisma.studioRating.findFirst({ where });
    case "tag":
      return prisma.tagRating.findFirst({ where });
    case "gallery":
      return prisma.galleryRating.findFirst({ where });
    case "group":
      return prisma.groupRating.findFirst({ where });
    case "image":
      return prisma.imageRating.findFirst({ where });
  }
}

interface RatingResponse {
  success?: boolean;
  rating?: { instanceId: string | null };
  error?: string;
}

describe("Ratings access (integration)", () => {
  let rater: { id: number; client: TestClient };

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    rater = await createApiUser("access_it_rater", "access_it_pass_1");
    await hideFixtureDefaults(rater.id);
  }, 60000);

  afterAll(async () => {
    if (rater) {
      await adminClient.delete(`/api/user/${rater.id}`);
    }
    await clearAccessFixture();
  }, 60000);

  it.each(RATED_TYPES)(
    "PUT /api/ratings/%s stores a rating on the instance the user can see",
    async (type) => {
      const res = await rater.client.put<RatingResponse>(
        `/api/ratings/${type}/${FX_ID.SAME}`,
        { rating: 80, instanceId: FX.A }
      );

      expect(res.status).toBe(200);
      expect(res.data.rating?.instanceId).toBe(FX.A);
    }
  );

  it.each(RATED_TYPES)(
    "PUT /api/ratings/%s returns 404 and stores nothing where the user hid the entity",
    async (type) => {
      const res = await rater.client.put<RatingResponse>(
        `/api/ratings/${type}/${FX_ID.SAME}`,
        { favorite: true, instanceId: FX.B }
      );

      expect(res.status).toBe(404);
      expect(await findRatingOnB(type, rater.id)).toBeNull();
    }
  );

  it("refuses soft-deleted, disabled-instance, unknown-instance and globally hidden scenes", async () => {
    const cases: [string, string][] = [
      [FX_ID.DELETED, FX.A],
      [FX_ID.ON_OFF, FX.OFF],
      [FX_ID.SAME, "nope"],
      [FX_ID.GLOBAL, FX.A],
    ];
    for (const [id, instanceId] of cases) {
      const res = await rater.client.put(`/api/ratings/scene/${id}`, {
        rating: 50,
        instanceId,
      });
      expect(res.status, `${id}@${instanceId}`).toBe(404);
    }

    const stored = await prisma.sceneRating.findMany({
      where: {
        userId: rater.id,
        sceneId: { in: [FX_ID.DELETED, FX_ID.ON_OFF, FX_ID.GLOBAL] },
      },
    });
    expect(stored).toEqual([]);
  });

  it("resolves a missing instanceId and still checks it", async () => {
    // GLOBAL is hidden on every instance, so the guess finds no copy the
    // rater can see.
    const res = await rater.client.put(`/api/ratings/scene/${FX_ID.GLOBAL}`, {
      rating: 50,
    });

    expect(res.status).toBe(404);
  });

  it("a regular user cannot switch on Sync to Stash", async () => {
    const res = await rater.client.put("/api/user/settings", {
      syncToStash: true,
    });
    expect(res.status).toBe(403);

    const settings = await rater.client.get<{
      settings: { syncToStash: boolean };
    }>("/api/user/settings");
    expect(settings.data.settings.syncToStash).toBe(false);
  });

  it("an admin can switch Sync to Stash for a user", async () => {
    try {
      const res = await adminClient.put(`/api/user/${rater.id}/settings`, {
        syncToStash: true,
      });
      expect(res.status).toBe(200);

      const settings = await rater.client.get<{
        settings: { syncToStash: boolean };
      }>("/api/user/settings");
      expect(settings.data.settings.syncToStash).toBe(true);
    } finally {
      await adminClient.put(`/api/user/${rater.id}/settings`, {
        syncToStash: false,
      });
    }
  });
});
