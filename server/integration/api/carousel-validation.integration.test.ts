/**
 * Carousel, recommendation and similar-scene requests through the one
 * parser (item 38): unknown or invalid input answers 400.
 *
 * A carousel's rules, sort and direction are checked against the scene
 * contract when it is saved or previewed; stored rules parse leniently when
 * it runs, since the user cannot fix them by resending. A carousel shows
 * only the user's instances (invariant 11): enabled, selected and past their
 * first sync. Recommended and similar scenes read their page, page size and
 * instance through the parser too; the recommended page size is held to 250.
 *
 * Everything lives on made-up instances: the access fixture's A, B and the
 * disabled OFF (a scene with the same id on A and B, a scene on B only, a
 * scene on OFF), a first-syncing instance, and one holding 300 scenes of a
 * studio the recommendation user favorites. Every seeded row is deleted
 * before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRecommendedScenes } from "../../controllers/library/scenes.js";
import prisma from "../../prisma/singleton.js";
import rankingComputeService from "../../services/RankingComputeService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import {
  reqFor,
  resFor,
  testUser,
} from "../../tests/helpers/controllerTestUtils.js";
import { must } from "../../tests/helpers/must.js";
import type {
  CreateCarouselResponse,
  ExecuteCarouselByIdResponse,
  FindSimilarScenesResponse,
  GetCarouselResponse,
  PreviewCarouselResponse,
} from "../../types/api/index.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { expectRefused } from "../helpers/refused.js";
import { recordStatements } from "../helpers/statementRecorder.js";
import {
  type TestClient,
  adminClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

/** Enabled, but its first sync has not finished: nobody sees it yet */
const FIRST_SYNCING = "carousel-it-new";
/** Holds the recommendation fixture */
const REC = "carousel-it-rec";
const OWN_INSTANCES = [FIRST_SYNCING, REC];
const REC_STUDIO = "7760900";
const REC_SCENES = 300;
const PASSWORD = "access_it_carousel_pass_1";

interface Viewer {
  id: number;
  client: TestClient;
}

/**
 * The scene rules every instance case uses: SAME on A and B, B_ONLY,
 * ON_OFF. A preview takes them; a save refuses a flat `ids` (a stored tree
 * cannot hold it), so a carousel holding them is seeded as a row stored
 * before 9b, which runs with them in its filter.
 */
const IDS_RULES = {
  ids: {
    value: [FX_ID.SAME, FX_ID.B_ONLY, FX_ID.ON_OFF],
    modifier: "INCLUDES",
  },
};

/**
 * What a carousel answered: each scene as instance/title, sorted (the
 * seeded scenes have no stored sort columns, so their order is not the
 * point)
 */
const shown = (
  scenes: readonly { instanceId: string; title: string | null }[]
) => scenes.map((s) => `${s.instanceId}/${s.title ?? ""}`).sort();

async function clearOwnFixture(): Promise<void> {
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: { in: OWN_INSTANCES } },
  });
  await prisma.stashStudio.deleteMany({
    where: { stashInstanceId: { in: OWN_INSTANCES } },
  });
  await prisma.userStashInstance.deleteMany({
    where: { instanceId: { in: OWN_INSTANCES } },
  });
  await prisma.stashInstance.deleteMany({
    where: { id: { in: OWN_INSTANCES } },
  });
}

describe("carousel, recommended and similar requests", () => {
  /** No instance selection: every enabled instance past its first sync */
  let everyInstance: Viewer | undefined;
  /** Selected A only */
  let onlyA: Viewer | undefined;
  /** Selected only the first-syncing instance */
  let onlyFirstSyncing: Viewer | undefined;
  /** Favorites REC's studio */
  let recommender: Viewer | undefined;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await clearOwnFixture();
    await seedAccessFixture();

    await prisma.stashInstance.create({
      data: {
        id: FIRST_SYNCING,
        name: FIRST_SYNCING,
        url: "http://127.0.0.1:9/graphql",
        apiKey: "fixture-key",
        enabled: true,
        priority: 930,
        firstSyncedAt: null,
      },
    });
    await prisma.stashInstance.create({
      data: {
        id: REC,
        name: REC,
        url: "http://127.0.0.1:9/graphql",
        apiKey: "fixture-key",
        enabled: true,
        priority: 931,
        firstSyncedAt: new Date(),
      },
    });
    await prisma.stashStudio.create({
      data: { id: REC_STUDIO, stashInstanceId: REC, name: "Rec studio" },
    });
    await prisma.stashScene.createMany({
      data: Array.from({ length: REC_SCENES }, (_, i) => ({
        id: String(7760001 + i),
        stashInstanceId: REC,
        title: `Rec ${i + 1}`,
        studioId: REC_STUDIO,
      })),
    });

    everyInstance = await createApiUser("access_it_carousel_all", PASSWORD);
    onlyA = await createApiUser("access_it_carousel_a", PASSWORD);
    await prisma.userStashInstance.create({
      data: { userId: onlyA.id, instanceId: FX.A },
    });
    onlyFirstSyncing = await createApiUser("access_it_carousel_new", PASSWORD);
    await prisma.userStashInstance.create({
      data: { userId: onlyFirstSyncing.id, instanceId: FIRST_SYNCING },
    });
    recommender = await createApiUser("access_it_carousel_rec", PASSWORD);
    await prisma.studioRating.create({
      data: {
        userId: recommender.id,
        studioId: REC_STUDIO,
        instanceId: REC,
        favorite: true,
      },
    });
  }, 60000);

  afterAll(async () => {
    // A ranking refresh the recommendation started finishes before its user goes
    if (recommender) {
      await rankingComputeService.ensureFresh(recommender.id, { wait: true });
    }
    await clearAccessFixture();
    await clearOwnFixture();
  });

  describe("saving and previewing", () => {
    it("saving a carousel with an unknown rule key answers 400 and stores nothing", async () => {
      const { id, client } = must(everyInstance, "the viewer");

      const response = await client.post("/api/carousels", {
        title: "Unknown rule",
        rules: { ...IDS_RULES, not_a_field: { value: 1, modifier: "EQUALS" } },
      });

      expectRefused(response, ["rules.not_a_field"]);
      expect(
        await prisma.userCarousel.count({
          where: { userId: id, title: "Unknown rule" },
        })
      ).toBe(0);
    });

    it("carousel sort bogus answers 400", async () => {
      const { client } = must(everyInstance, "the viewer");

      const preview = await client.post("/api/carousels/preview", {
        rules: IDS_RULES,
        sort: "bogus",
      });

      expectRefused(preview, ["sort"]);
    });

    it("saving a carousel with sort bogus answers 400 and stores nothing", async () => {
      const { id, client } = must(everyInstance, "the viewer");

      const response = await client.post("/api/carousels", {
        title: "Bogus sort",
        rules: IDS_RULES,
        sort: "bogus",
      });

      expectRefused(response, ["sort"]);
      expect(
        await prisma.userCarousel.count({
          where: { userId: id, title: "Bogus sort" },
        })
      ).toBe(0);
    });

    it("updating a carousel with an unknown rule key or direction sideways answers 400 and leaves it as it was", async () => {
      const { id, client } = must(everyInstance, "the viewer");
      // A tree: a locked carousel's (flat with ids) update ignores rules
      const kept = {
        match: "all",
        rules: [
          {
            field: "rating100",
            criterion: { value: 80, modifier: "GREATER_THAN" },
          },
        ],
      };
      const carousel = await prisma.userCarousel.create({
        data: {
          userId: id,
          title: "Kept",
          icon: "Film",
          rules: kept,
          sort: "title",
          direction: "ASC",
        },
      });

      const response = await client.put(`/api/carousels/${carousel.id}`, {
        rules: { not_a_field: { value: 1 } },
        direction: "sideways",
      });

      expectRefused(response, ["rules.not_a_field", "direction"]);
      const stored = await prisma.userCarousel.findUniqueOrThrow({
        where: { id: carousel.id },
      });
      expect(stored.rules).toEqual(kept);
      expect(stored.direction).toBe("ASC");
    });
  });

  describe("rules as a tree", () => {
    /** One title row: the fixture's scenes are titled `<instance label>-<id>` */
    const titled = (title: string) => ({
      field: "title",
      criterion: { value: title, modifier: "EQUALS" },
    });
    const anyOfTwo = {
      match: "all",
      rules: [
        {
          match: "any",
          rules: [titled(`A-${FX_ID.SAME}`), titled(`B-${FX_ID.B_ONLY}`)],
        },
      ],
    };

    it("a carousel saved as a tree with an any group stores the tree and lists either side", async () => {
      const { client } = must(everyInstance, "the viewer");

      const created = await client.post<CreateCarouselResponse>(
        "/api/carousels",
        { title: "Any group", rules: anyOfTwo, sort: "title", direction: "ASC" }
      );
      expect(created.status).toBe(201);
      expect(created.data.carousel.rules).toEqual(anyOfTwo);
      const executed = await client.get<ExecuteCarouselByIdResponse>(
        `/api/carousels/${created.data.carousel.id}/execute`
      );
      const preview = await client.post<PreviewCarouselResponse>(
        "/api/carousels/preview",
        { rules: anyOfTwo, sort: "title", direction: "ASC" }
      );

      const expected = [`${FX.A}/A-${FX_ID.SAME}`, `${FX.B}/B-${FX_ID.B_ONLY}`];
      expect(executed.status).toBe(200);
      expect(shown(executed.data.scenes)).toEqual(expected);
      expect(preview.status).toBe(200);
      expect(shown(preview.data.scenes)).toEqual(expected);
      const stored = await prisma.userCarousel.findUniqueOrThrow({
        where: { id: created.data.carousel.id },
      });
      expect(stored.rules).toEqual(anyOfTwo);
    });

    it("flat rules are saved as their tree, and a flat ids is refused", async () => {
      const { id, client } = must(everyInstance, "the viewer");
      const flat = { title: titled(`B-${FX_ID.B_ONLY}`).criterion };

      const created = await client.post<CreateCarouselResponse>(
        "/api/carousels",
        { title: "Flat", rules: flat, sort: "title", direction: "ASC" }
      );
      const refused = await client.post("/api/carousels", {
        title: "Flat ids",
        rules: IDS_RULES,
      });

      expect(created.status).toBe(201);
      const tree = { match: "all", rules: [titled(`B-${FX_ID.B_ONLY}`)] };
      expect(created.data.carousel.rules).toEqual(tree);
      expect(
        (
          await prisma.userCarousel.findUniqueOrThrow({
            where: { id: created.data.carousel.id },
          })
        ).rules
      ).toEqual(tree);
      expectRefused(refused, ["rules.ids"]);
      expect(
        await prisma.userCarousel.count({
          where: { userId: id, title: "Flat ids" },
        })
      ).toBe(0);
    });

    it("a stored flat row is served as its tree, and runs with its ids", async () => {
      const { id, client } = must(everyInstance, "the viewer");
      const carousel = await prisma.userCarousel.create({
        data: {
          userId: id,
          title: "Stored flat",
          icon: "Film",
          rules: { ...IDS_RULES, title: titled(`B-${FX_ID.SAME}`).criterion },
          sort: "title",
          direction: "ASC",
        },
      });

      const served = await client.get<GetCarouselResponse>(
        `/api/carousels/${carousel.id}`
      );
      const executed = await client.get<ExecuteCarouselByIdResponse>(
        `/api/carousels/${carousel.id}/execute`
      );

      expect(served.data.carousel.rules).toEqual({
        match: "all",
        rules: [titled(`B-${FX_ID.SAME}`)],
      });
      expect(shown(executed.data.scenes)).toEqual([`${FX.B}/B-${FX_ID.SAME}`]);
    });
  });

  describe("a locked carousel (flat rules naming ids)", () => {
    it("a title edit keeps the stored ids and the carousel lists the same scenes, whether the client resends the served tree or no rules", async () => {
      const { id, client } = must(everyInstance, "the viewer");
      const carousel = await prisma.userCarousel.create({
        data: {
          userId: id,
          title: "Locked",
          icon: "Film",
          rules: IDS_RULES,
          sort: "title",
          direction: "ASC",
        },
      });
      const execute = async () =>
        shown(
          (
            await client.get<ExecuteCarouselByIdResponse>(
              `/api/carousels/${carousel.id}/execute`
            )
          ).data.scenes
        );
      const before = await execute();
      const served = await client.get<GetCarouselResponse>(
        `/api/carousels/${carousel.id}`
      );
      expect(served.data.carousel.rulesLocked).toBe(true);

      // A client built before rulesLocked resends the served tree, which
      // has no row for the ids; this one sends no rules
      const edits = [
        { title: "Renamed", rules: served.data.carousel.rules },
        { title: "Renamed again", sort: "title", direction: "DESC" },
      ];
      for (const body of edits) {
        const response = await client.put<GetCarouselResponse>(
          `/api/carousels/${carousel.id}`,
          body
        );
        expect(response.status, JSON.stringify(response.data)).toBe(200);
        expect(response.data.carousel.title).toBe(body.title);
        expect(response.data.carousel.rulesLocked).toBe(true);
      }

      const stored = await prisma.userCarousel.findUniqueOrThrow({
        where: { id: carousel.id },
      });
      expect(stored.rules).toEqual(IDS_RULES);
      expect(before.length).toBeGreaterThan(0);
      expect(await execute()).toEqual(before);
    });
  });

  describe("stored carousels", () => {
    it("a carousel stored with an unknown key renders without it", async () => {
      const { id, client } = must(everyInstance, "the viewer");
      const carousel = await prisma.userCarousel.create({
        data: {
          userId: id,
          title: "Stored unknown key",
          icon: "Film",
          rules: {
            not_a_field: { value: 1, modifier: "EQUALS" },
            ids: { value: [FX_ID.SAME, FX_ID.B_ONLY], modifier: "INCLUDES" },
          },
          sort: "title",
          direction: "ASC",
        },
      });

      const response = await client.get<ExecuteCarouselByIdResponse>(
        `/api/carousels/${carousel.id}/execute`
      );

      expect(response.status).toBe(200);
      expect(shown(response.data.scenes)).toEqual([
        `${FX.A}/A-${FX_ID.SAME}`,
        `${FX.B}/B-${FX_ID.SAME}`,
        `${FX.B}/B-${FX_ID.B_ONLY}`,
      ]);
    });

    it("a carousel rule with a playlist runs for its owner: another user's carousel with the same playlist id lists nothing", async () => {
      const owner = must(everyInstance, "the playlist's owner");
      const other = must(onlyA, "another user");
      const playlist = await prisma.playlist.create({
        data: {
          name: "Carousel playlist",
          userId: owner.id,
          items: {
            create: [{ instanceId: FX.A, sceneId: FX_ID.SAME, position: 0 }],
          },
        },
      });
      try {
        const rules = {
          playlists: { value: [playlist.id], modifier: "INCLUDES" },
        };
        const run = async (viewer: Viewer) => {
          const carousel = await prisma.userCarousel.create({
            data: {
              userId: viewer.id,
              title: "Playlist rule",
              icon: "Film",
              rules,
              sort: "title",
              direction: "ASC",
            },
          });
          const response = await viewer.client.get<ExecuteCarouselByIdResponse>(
            `/api/carousels/${carousel.id}/execute`
          );
          expect(response.status).toBe(200);
          return shown(response.data.scenes);
        };

        expect(await run(owner)).toEqual([`${FX.A}/A-${FX_ID.SAME}`]);
        // The playlist is neither the other user's nor shared with them
        expect(await run(other)).toEqual([]);
      } finally {
        await prisma.playlist.delete({ where: { id: playlist.id } });
      }
    });

    it("a carousel stored with sort constructor renders in the default order", async () => {
      const { id, client } = must(everyInstance, "the viewer");
      const carousel = await prisma.userCarousel.create({
        data: {
          userId: id,
          title: "Stored bad sort",
          icon: "Film",
          rules: IDS_RULES,
          sort: "constructor",
          direction: "DESC",
        },
      });

      const response = await client.get<ExecuteCarouselByIdResponse>(
        `/api/carousels/${carousel.id}/execute`
      );

      expect(response.status).toBe(200);
      expect(shown(response.data.scenes)).toEqual([
        `${FX.A}/A-${FX_ID.SAME}`,
        `${FX.B}/B-${FX_ID.SAME}`,
        `${FX.B}/B-${FX_ID.B_ONLY}`,
      ]);
    });
  });

  describe("the user's instances", () => {
    it("a carousel never lists a disabled instance's scenes", async () => {
      const { client } = must(everyInstance, "the viewer");

      const preview = await client.post<PreviewCarouselResponse>(
        "/api/carousels/preview",
        { rules: IDS_RULES, sort: "title", direction: "ASC" }
      );

      expect(preview.status).toBe(200);
      expect(shown(preview.data.scenes)).toEqual([
        `${FX.A}/A-${FX_ID.SAME}`,
        `${FX.B}/B-${FX_ID.SAME}`,
        `${FX.B}/B-${FX_ID.B_ONLY}`,
      ]);
    });

    it("a carousel for a user who selected only instance A returns no B scenes", async () => {
      const { id, client } = must(onlyA, "the A-only viewer");
      const carousel = await prisma.userCarousel.create({
        data: {
          userId: id,
          title: "Only A",
          icon: "Film",
          rules: IDS_RULES,
          sort: "title",
          direction: "ASC",
        },
      });

      const executed = await client.get<ExecuteCarouselByIdResponse>(
        `/api/carousels/${carousel.id}/execute`
      );
      const preview = await client.post<PreviewCarouselResponse>(
        "/api/carousels/preview",
        { rules: IDS_RULES, sort: "title", direction: "ASC" }
      );

      expect(executed.status).toBe(200);
      expect(shown(executed.data.scenes)).toEqual([`${FX.A}/A-${FX_ID.SAME}`]);
      expect(preview.status).toBe(200);
      expect(shown(preview.data.scenes)).toEqual([`${FX.A}/A-${FX_ID.SAME}`]);
    });

    it("execute and preview answer 503 ready:false for a user whose only instance is on its first sync", async () => {
      const { id, client } = must(onlyFirstSyncing, "the first-syncing viewer");
      const carousel = await prisma.userCarousel.create({
        data: {
          userId: id,
          title: "Waiting",
          icon: "Film",
          rules: IDS_RULES,
          sort: "title",
          direction: "ASC",
        },
      });

      const executed = await client.get(
        `/api/carousels/${carousel.id}/execute`
      );
      const preview = await client.post("/api/carousels/preview", {
        rules: IDS_RULES,
      });

      expect(executed.status).toBe(503);
      expect(executed.data).toMatchObject({ ready: false });
      expect(preview.status).toBe(503);
      expect(preview.data).toMatchObject({ ready: false });
    });
  });

  describe("recommended", () => {
    it("recommended per_page 1000 returns 250", async () => {
      const { id } = must(recommender, "the recommendation user");
      const req = reqFor(getRecommendedScenes, {
        query: { page: "1", per_page: "1000" },
        user: testUser({ id, username: "access_it_carousel_rec" }),
        allowedInstanceIds: await getUserAllowedInstanceIds(id),
      });
      const res = resFor(getRecommendedScenes);
      const recorder = recordStatements();
      try {
        await getRecommendedScenes(req, res);
      } finally {
        recorder.restore();
      }

      expect(res._getStatus()).toBe(200);
      const body = res._getOkBody();
      expect(body.count).toBe(REC_SCENES);
      expect(body.perPage).toBe(250);
      expect(body.scenes).toHaveLength(250);
      // The page is the scene list's statement within the ranked refs (one
      // joined CTE), paged in SQL, never a lookup of the page's refs
      const pages = recorder.statements.filter(({ sql }) =>
        sql.includes("LIMIT ? OFFSET ?")
      );
      expect(pages).toHaveLength(1);
      expect(pages[0]?.sql).toContain("JOIN ranked_refs k");
    });

    it("recommended page abc answers 400", async () => {
      const { client } = must(recommender, "the recommendation user");

      const response = await client.get(
        "/api/library/scenes/recommended?page=abc&per_page=24"
      );

      expectRefused(response, ["page"]);
    });

    it("an unknown recommended parameter answers 400", async () => {
      const { client } = must(recommender, "the recommendation user");

      const response = await client.get(
        "/api/library/scenes/recommended?page=1&sort=title"
      );

      expectRefused(response, ["sort"]);
    });
  });

  describe("similar", () => {
    let testInstanceId: string;

    beforeAll(async () => {
      testInstanceId = await selectTestInstanceOnly();
    });

    afterAll(restoreInstanceSelection);

    const similarPath = (query: string) =>
      `/api/library/scenes/${TEST_ENTITIES.sceneWithRelations}/similar?${query}`;

    it("the scene's instanceId and a page are read", async () => {
      const response = await adminClient.get<FindSimilarScenesResponse>(
        similarPath(`instanceId=${testInstanceId}&page=1`)
      );

      expect(response.status).toBe(200);
      expect(response.data.page).toBe(1);
      expect(response.data.perPage).toBe(12);
    });

    it("similar page abc answers 400", async () => {
      const response = await adminClient.get(
        similarPath(`instanceId=${testInstanceId}&page=abc`)
      );

      expectRefused(response, ["page"]);
    });

    it("a request without an instanceId answers 400: the seed is never guessed", async () => {
      const response = await adminClient.get(similarPath("page=1"));

      expectRefused(response, ["instanceId"]);
    });

    it("an instanceId that is not an instance id answers 400", async () => {
      const response = await adminClient.get(
        similarPath("instanceId=not%20an%20instance&page=1")
      );

      expectRefused(response, ["instanceId"]);
    });
  });
});
