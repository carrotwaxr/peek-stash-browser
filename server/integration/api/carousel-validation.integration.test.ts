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

/** The scene rules every instance case uses: SAME on A and B, B_ONLY, ON_OFF */
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
      const { client } = must(everyInstance, "the viewer");
      const created = await client.post<CreateCarouselResponse>(
        "/api/carousels",
        { title: "Kept", rules: IDS_RULES, sort: "title", direction: "ASC" }
      );
      expect(created.status).toBe(201);
      const { carousel } = created.data;

      const response = await client.put(`/api/carousels/${carousel.id}`, {
        rules: { not_a_field: { value: 1 } },
        direction: "sideways",
      });

      expectRefused(response, ["rules.not_a_field", "direction"]);
      const stored = await prisma.userCarousel.findUniqueOrThrow({
        where: { id: carousel.id },
      });
      expect(stored.rules).toEqual(IDS_RULES);
      expect(stored.direction).toBe("ASC");
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
      const { client } = must(onlyA, "the A-only viewer");
      const created = await client.post<CreateCarouselResponse>(
        "/api/carousels",
        { title: "Only A", rules: IDS_RULES, sort: "title", direction: "ASC" }
      );
      expect(created.status).toBe(201);

      const executed = await client.get<ExecuteCarouselByIdResponse>(
        `/api/carousels/${created.data.carousel.id}/execute`
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
      // The clamped page is 250 refs; the hydration statement binds them
      // and carries no LIMIT (a bare ref may match a row per instance)
      expect(
        recorder.statements.filter(({ sql }) =>
          sql.includes("LIMIT ? OFFSET ?")
        )
      ).toHaveLength(0);
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
