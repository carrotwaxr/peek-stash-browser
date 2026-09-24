/**
 * Watch-history and image-view writes over HTTP (item 6).
 *
 * Plays, resume points, O counts and image views are stored only for an
 * entity the user can see. The viewer hides the fixture defaults (see
 * helpers/accessFixture.ts): SAME on B for every type, GLOBAL on every
 * instance, HIDDEN_A's image on A.
 */
import os from "node:os";
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

/** The four watch-history writes, with the extra fields each one needs. */
const WATCH_WRITES: [string, Record<string, unknown>][] = [
  ["ping", { currentTime: 1 }],
  ["save-activity", { resumeTime: 5, playDuration: 5 }],
  ["increment-play-count", {}],
  ["increment-o", {}],
];

const IMAGE_WRITES = ["view", "increment-o"];

describe("History access (integration)", () => {
  let viewer: { id: number; client: TestClient };

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    viewer = await createApiUser("access_it_viewer", "access_it_pass_1");
    await hideFixtureDefaults(viewer.id);
  }, 60000);

  afterAll(async () => {
    if (viewer) {
      await adminClient.delete(`/api/user/${viewer.id}`);
    }
    await clearAccessFixture();
  }, 60000);

  it("watch-history writes on a visible scene succeed", async () => {
    const scene = { sceneId: FX_ID.SAME, instanceId: FX.A };

    const saved = await viewer.client.post("/api/watch-history/save-activity", {
      ...scene,
      resumeTime: 5,
      playDuration: 5,
    });
    expect(saved.status).toBe(200);

    const played = await viewer.client.post(
      "/api/watch-history/increment-play-count",
      scene
    );
    expect(played.status).toBe(200);

    const oed = await viewer.client.post(
      "/api/watch-history/increment-o",
      scene
    );
    expect(oed.status).toBe(200);

    const row = await prisma.watchHistory.findUnique({
      where: {
        userId_instanceId_sceneId: {
          userId: viewer.id,
          instanceId: FX.A,
          sceneId: FX_ID.SAME,
        },
      },
    });
    expect(row?.oCount).toBe(1);
    expect(row?.playCount).toBe(1);
  });

  it.each(WATCH_WRITES)(
    "watch-history writes return 404 and store nothing where the scene is hidden or gone (%s)",
    async (route, extra) => {
      const bodies: Record<string, unknown>[] = [
        { sceneId: FX_ID.SAME, instanceId: FX.B },
        // No instance: GLOBAL is hidden on every instance, so the guess
        // finds nothing.
        { sceneId: FX_ID.GLOBAL },
      ];
      if (route === "save-activity") {
        bodies.push({ sceneId: FX_ID.DELETED, instanceId: FX.A });
      }

      for (const body of bodies) {
        const res = await viewer.client.post(`/api/watch-history/${route}`, {
          ...body,
          ...extra,
        });
        expect(res.status, JSON.stringify(body)).toBe(404);
      }

      const rows = await prisma.watchHistory.findMany({
        where: {
          userId: viewer.id,
          OR: [
            { instanceId: FX.B },
            { sceneId: { in: [FX_ID.GLOBAL, FX_ID.DELETED] } },
          ],
        },
      });
      expect(rows).toEqual([]);
    }
  );

  it("image-view writes on a visible image succeed", async () => {
    const image = { imageId: FX_ID.SAME, instanceId: FX.A };

    const viewed = await viewer.client.post(
      "/api/image-view-history/view",
      image
    );
    expect(viewed.status).toBe(200);

    const oed = await viewer.client.post(
      "/api/image-view-history/increment-o",
      image
    );
    expect(oed.status).toBe(200);

    const row = await prisma.imageViewHistory.findUnique({
      where: {
        userId_instanceId_imageId: {
          userId: viewer.id,
          instanceId: FX.A,
          imageId: FX_ID.SAME,
        },
      },
    });
    expect(row?.viewCount).toBe(1);
    expect(row?.oCount).toBe(1);
  });

  it("image-view writes return 404 and store nothing for hidden images", async () => {
    const bodies = [
      { imageId: FX_ID.SAME, instanceId: FX.B },
      { imageId: FX_ID.HIDDEN_A, instanceId: FX.A },
    ];
    for (const route of IMAGE_WRITES) {
      for (const body of bodies) {
        const res = await viewer.client.post(
          `/api/image-view-history/${route}`,
          body
        );
        expect(res.status, `${route} ${JSON.stringify(body)}`).toBe(404);
      }
    }

    const rows = await prisma.imageViewHistory.findMany({
      where: {
        userId: viewer.id,
        OR: [{ instanceId: FX.B }, { imageId: FX_ID.HIDDEN_A }],
      },
    });
    expect(rows).toEqual([]);
  });

  /**
   * Writes to one history row that arrive together (item 81). Before each
   * round the viewer's row is deleted, so every round races on creating it.
   * The outcomes of all rounds are compared at once, so a failure shows
   * every round.
   */
  describe("writes that arrive together", () => {
    const ROUNDS = 10;
    /**
     * More writes at once than the Prisma query engine has worker threads
     * (one per CPU): were they to wait for the write lock inside the engine,
     * they would leave the one holding it no thread to commit on. A burst
     * this size shows that on any machine; CI's runner has 4 CPUs.
     */
    const BURST = 2 * os.availableParallelism() + 2;
    const counted = Array.from({ length: BURST }, (_, i) => i + 1);
    const image = { imageId: FX_ID.SAME, instanceId: FX.A };
    const scene = { sceneId: FX_ID.SAME, instanceId: FX.A };

    const imageKey = () => ({
      userId_instanceId_imageId: {
        userId: viewer.id,
        instanceId: FX.A,
        imageId: FX_ID.SAME,
      },
    });
    const sceneKey = () => ({
      userId_instanceId_sceneId: {
        userId: viewer.id,
        instanceId: FX.A,
        sceneId: FX_ID.SAME,
      },
    });

    const clearImageRow = () =>
      prisma.imageViewHistory.deleteMany({
        where: { userId: viewer.id, instanceId: FX.A, imageId: FX_ID.SAME },
      });
    const clearSceneRow = () =>
      prisma.watchHistory.deleteMany({
        where: { userId: viewer.id, instanceId: FX.A, sceneId: FX_ID.SAME },
      });

    /** A history column as the test reads it: its length, or its JS type. */
    const shape = (value: unknown) =>
      Array.isArray(value) ? value.length : typeof value;

    it("an image O press and a view recorded at the same moment both count", async () => {
      const outcomes = [];
      for (let round = 0; round < ROUNDS; round++) {
        await clearImageRow();
        const [oed, viewed] = await Promise.all([
          viewer.client.post("/api/image-view-history/increment-o", image),
          viewer.client.post("/api/image-view-history/view", image),
        ]);
        const row = await prisma.imageViewHistory.findUnique({
          where: imageKey(),
        });
        outcomes.push({
          round,
          status: [oed.status, viewed.status],
          oCount: row?.oCount,
          viewCount: row?.viewCount,
        });
      }

      expect(outcomes).toEqual(
        Array.from({ length: ROUNDS }, (_, round) => ({
          round,
          status: [200, 200],
          oCount: 1,
          viewCount: 1,
        }))
      );
    });

    it("a burst of image O presses all count", async () => {
      await clearImageRow();
      const responses = await Promise.all(
        Array.from({ length: BURST }, () =>
          viewer.client.post<{ oCount?: number }>(
            "/api/image-view-history/increment-o",
            image
          )
        )
      );
      const row = await prisma.imageViewHistory.findUnique({
        where: imageKey(),
      });

      expect({
        statuses: responses.map((r) => r.status),
        returned: responses
          .map((r) => r.data.oCount ?? 0)
          .sort((a, b) => a - b),
        oCount: row?.oCount,
        oHistory: shape(row?.oHistory),
      }).toEqual({
        statuses: Array(BURST).fill(200),
        returned: counted,
        oCount: BURST,
        oHistory: BURST,
      });
    });

    it("scene history writes that arrive together all count", async () => {
      const outcomes = [];
      for (let round = 0; round < ROUNDS; round++) {
        await clearSceneRow();
        const responses = await Promise.all([
          viewer.client.post("/api/watch-history/ping", {
            ...scene,
            currentTime: 1,
          }),
          viewer.client.post("/api/watch-history/increment-o", scene),
          viewer.client.post("/api/watch-history/increment-play-count", scene),
          viewer.client.post("/api/watch-history/save-activity", {
            ...scene,
            resumeTime: 5,
            playDuration: 5,
          }),
        ]);
        const row = await prisma.watchHistory.findUnique({
          where: sceneKey(),
        });
        outcomes.push({
          round,
          status: responses.map((r) => r.status),
          oCount: row?.oCount,
          playCount: row?.playCount,
          playDuration: row?.playDuration,
          oHistory: shape(row?.oHistory),
          playHistory: shape(row?.playHistory),
        });
      }

      // The fixture scene has no duration, so ping never adds a play itself.
      expect(outcomes).toEqual(
        Array.from({ length: ROUNDS }, (_, round) => ({
          round,
          status: [200, 200, 200, 200],
          oCount: 1,
          playCount: 1,
          playDuration: 5,
          oHistory: 1,
          playHistory: 1,
        }))
      );
    });

    it("a burst of scene O presses all count", async () => {
      await clearSceneRow();
      const responses = await Promise.all(
        Array.from({ length: BURST }, () =>
          viewer.client.post<{ oCount?: number }>(
            "/api/watch-history/increment-o",
            scene
          )
        )
      );
      const row = await prisma.watchHistory.findUnique({ where: sceneKey() });

      expect({
        statuses: responses.map((r) => r.status),
        returned: responses
          .map((r) => r.data.oCount ?? 0)
          .sort((a, b) => a - b),
        oCount: row?.oCount,
        oHistory: shape(row?.oHistory),
      }).toEqual({
        statuses: Array(BURST).fill(200),
        returned: counted,
        oCount: BURST,
        oHistory: BURST,
      });
    });

    it("a burst of play-count increments records every play", async () => {
      await clearSceneRow();
      const responses = await Promise.all(
        Array.from({ length: BURST }, () =>
          viewer.client.post("/api/watch-history/increment-play-count", scene)
        )
      );
      const row = await prisma.watchHistory.findUnique({ where: sceneKey() });

      expect({
        statuses: responses.map((r) => r.status),
        playCount: row?.playCount,
        playHistory: shape(row?.playHistory),
      }).toEqual({
        statuses: Array(BURST).fill(200),
        playCount: BURST,
        playHistory: BURST,
      });
    });
  });
});
