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

/** The three watch-history writes, with the extra fields each one needs. */
const WATCH_WRITES: [string, Record<string, unknown>][] = [
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
    // beforeAll may have failed before it set viewer
    const created = viewer as typeof viewer | undefined;
    if (created) {
      await adminClient.delete(`/api/user/${created.id}`);
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
        // GLOBAL is hidden on every instance
        { sceneId: FX_ID.GLOBAL, instanceId: FX.A },
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

  it("increment-o, an image view or O and a similar-scenes request without an instance answer 400 and write nothing", async () => {
    const counts = async () => ({
      scenes: await prisma.watchHistory.findMany({
        where: { userId: viewer.id },
        orderBy: [{ instanceId: "asc" }, { sceneId: "asc" }],
      }),
      images: await prisma.imageViewHistory.findMany({
        where: { userId: viewer.id },
        orderBy: [{ instanceId: "asc" }, { imageId: "asc" }],
      }),
    });
    const before = await counts();

    // SAME is visible on A: only the missing instance is wrong
    const oScene = await viewer.client.post("/api/watch-history/increment-o", {
      sceneId: FX_ID.SAME,
    });
    const view = await viewer.client.post("/api/image-view-history/view", {
      imageId: FX_ID.SAME,
    });
    const oImage = await viewer.client.post(
      "/api/image-view-history/increment-o",
      { imageId: FX_ID.SAME }
    );
    const similar = await viewer.client.get(
      `/api/library/scenes/${FX_ID.SAME}/similar`
    );

    expect([oScene.status, view.status, oImage.status, similar.status]).toEqual(
      [400, 400, 400, 400]
    );
    expect(await counts()).toEqual(before);
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

      expect(outcomes).toEqual(
        Array.from({ length: ROUNDS }, (_, round) => ({
          round,
          status: [200, 200, 200],
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

  /**
   * The fixture's SAME scene is a different scene on A and on B. A play,
   * resume point or play count names its instance; the server never guesses.
   */
  describe("writes name their instance", () => {
    let writer: { id: number; client: TestClient };

    const rowsOf = (userId: number) =>
      prisma.watchHistory.findMany({
        where: { userId },
        orderBy: { instanceId: "asc" },
        select: { instanceId: true, sceneId: true, playCount: true },
      });

    beforeAll(async () => {
      writer = await createApiUser("history_it_writer", "history_it_pass_1");
    }, 60000);

    afterAll(async () => {
      const created = writer as typeof writer | undefined;
      if (created) {
        await prisma.watchHistory.deleteMany({ where: { userId: created.id } });
        await adminClient.delete(`/api/user/${created.id}`);
      }
    }, 60000);

    it.each(WATCH_WRITES.filter(([route]) => route !== "increment-o"))(
      "an activity save or play count without an instance answers 400 and writes nothing (%s)",
      async (route, extra) => {
        // SAME is visible to the writer on both instances, so a guess would
        // find one and store the write there.
        const res = await writer.client.post(`/api/watch-history/${route}`, {
          sceneId: FX_ID.SAME,
          ...extra,
        });

        expect(res.status).toBe(400);
        expect(await rowsOf(writer.id)).toEqual([]);
      }
    );

    it("a play on B's SAME lands on B's row and leaves A's untouched", async () => {
      await prisma.watchHistory.deleteMany({ where: { userId: writer.id } });
      const play = (instanceId: string) =>
        writer.client.post("/api/watch-history/increment-play-count", {
          sceneId: FX_ID.SAME,
          instanceId,
        });

      const onA = await play(FX.A);
      const onB = await play(FX.B);
      const againOnB = await play(FX.B);

      expect([onA.status, onB.status, againOnB.status]).toEqual([
        200, 200, 200,
      ]);
      expect(await rowsOf(writer.id)).toEqual([
        { instanceId: FX.A, sceneId: FX_ID.SAME, playCount: 1 },
        { instanceId: FX.B, sceneId: FX_ID.SAME, playCount: 2 },
      ]);
    });

    it("a play on each of two instances' same scene id counts on its own instance", async () => {
      await prisma.watchHistory.deleteMany({ where: { userId: writer.id } });
      const play = (instanceId: string) =>
        writer.client.post("/api/watch-history/increment-play-count", {
          sceneId: FX_ID.SAME,
          instanceId,
        });

      const statuses = [];
      for (const instanceId of [FX.A, FX.B]) {
        statuses.push((await play(instanceId)).status);
      }

      expect(statuses).toEqual([200, 200]);
      expect(await rowsOf(writer.id)).toEqual([
        { instanceId: FX.A, sceneId: FX_ID.SAME, playCount: 1 },
        { instanceId: FX.B, sceneId: FX_ID.SAME, playCount: 1 },
      ]);
    });
  });

  /**
   * The replay's libraries share ids, so one scene id is a different scene on
   * each instance. A read names its instance; it never picks one.
   */
  describe("reads with two instances sharing an id", () => {
    let reader: { id: number; client: TestClient };

    beforeAll(async () => {
      reader = await createApiUser("history_it_reader", "history_it_pass_1");
    }, 60000);

    afterAll(async () => {
      const created = reader as typeof reader | undefined;
      if (created) {
        await prisma.watchHistory.deleteMany({ where: { userId: created.id } });
        await prisma.imageViewHistory.deleteMany({
          where: { userId: created.id },
        });
        await adminClient.delete(`/api/user/${created.id}`);
      }
    }, 60000);

    it("each instance's resume point is read back on its own instance when two instances share the scene id", async () => {
      for (const [instanceId, currentTime] of [
        [FX.A, 10],
        [FX.B, 20],
      ] as const) {
        const saved = await reader.client.post(
          "/api/watch-history/save-activity",
          { sceneId: FX_ID.SAME, instanceId, resumeTime: currentTime }
        );
        expect(saved.status).toBe(200);
      }

      const read = async (instanceId: string) =>
        reader.client.get<{ exists: boolean; resumeTime: number | null }>(
          `/api/watch-history/${FX_ID.SAME}?instanceId=${instanceId}`
        );
      const [a, b] = await Promise.all([read(FX.A), read(FX.B)]);

      expect([a.status, b.status]).toEqual([200, 200]);
      expect([a.data.resumeTime, b.data.resumeTime]).toEqual([10, 20]);
    });

    it("each instance's image views are read back on their own instance", async () => {
      for (const [instanceId, views] of [
        [FX.A, 1],
        [FX.B, 2],
      ] as const) {
        for (let i = 0; i < views; i++) {
          const viewed = await reader.client.post(
            "/api/image-view-history/view",
            { imageId: FX_ID.SAME, instanceId }
          );
          expect(viewed.status).toBe(200);
        }
      }

      const read = async (instanceId: string) =>
        reader.client.get<{ viewCount: number }>(
          `/api/image-view-history/${FX_ID.SAME}?instanceId=${instanceId}`
        );
      const [a, b] = await Promise.all([read(FX.A), read(FX.B)]);

      expect([a.data.viewCount, b.data.viewCount]).toEqual([1, 2]);
    });

    it("a read without an instance is refused", async () => {
      const scene = await reader.client.get(`/api/watch-history/${FX_ID.SAME}`);
      const image = await reader.client.get(
        `/api/image-view-history/${FX_ID.SAME}`
      );
      expect([scene.status, image.status]).toEqual([400, 400]);
    });
  });
});
