/**
 * List requests through the one parser (item 38), with the server in reject
 * mode (`PEEK_FILTER_POLICY=reject`, set by the global setup).
 *
 * A sort outside the list's sort keys, an unknown filter field, a body that
 * is not an object and a bad clip parameter answer 400 with the path of what
 * was wrong; the direction is read in either case; a null modifier takes the
 * field's default; the clip page size is held to 250.
 *
 * The image by-id case seeds two made-up instances holding the same image id,
 * as two Stash servers do, and a user who sees both; every seeded row is
 * deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import { untrusted } from "../../tests/helpers/untrusted.js";
import type {
  AmbiguousLookupResponse,
  FindGalleriesResponse,
  FindGroupsResponse,
  FindImagesResponse,
  FindPerformersResponse,
  GetClipsResponse,
} from "../../types/api/index.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import { expectRefused } from "../helpers/refused.js";
import {
  type TestClient,
  adminClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

const A = "listreq-it-a";
const B = "listreq-it-b";
const INSTANCES = [A, B];
const IMAGE_ID = "7750001";
const USERNAME = "listreq_it_user";

async function clearFixture(): Promise<void> {
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  await prisma.stashImage.deleteMany({
    where: { stashInstanceId: { in: INSTANCES } },
  });
  await prisma.userStashInstance.deleteMany({
    where: { instanceId: { in: INSTANCES } },
  });
  await prisma.stashInstance.deleteMany({ where: { id: { in: INSTANCES } } });
}

describe("list request validation", () => {
  let testInstanceId: string;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    testInstanceId = await selectTestInstanceOnly();
  });

  it.each([
    "/api/library/scenes",
    "/api/library/performers",
    "/api/library/images",
  ])("sort constructor answers 400 naming filter.sort (%s)", async (path) => {
    const response = await adminClient.post(path, {
      filter: { sort: "constructor" },
    });

    expectRefused(response, ["filter.sort"]);
  });

  it.each([
    {
      path: "/api/library/galleries",
      sort: "title",
      ids: (data: unknown) =>
        (data as FindGalleriesResponse).findGalleries.galleries.map(
          (g) => g.id
        ),
    },
    {
      path: "/api/library/groups",
      sort: "name",
      ids: (data: unknown) =>
        (data as FindGroupsResponse).findGroups.groups.map((g) => g.id),
    },
  ])("direction asc sorts ascending ($path)", async ({ path, sort, ids }) => {
    const list = async (direction: string) => {
      const response = await adminClient.post(path, {
        filter: { sort, direction, per_page: 50 },
      });
      expect(response.status).toBe(200);
      return ids(response.data);
    };

    const ascending = await list("ASC");
    const descending = await list("DESC");
    // The order is observable: the fixture has several distinct names
    expect(ascending.length).toBeGreaterThan(1);
    expect(ascending).not.toEqual(descending);

    expect(await list("asc")).toEqual(ascending);
    expect(await list("desc")).toEqual(descending);
  });

  it("an unknown scene_filter key answers 400 with its path", async () => {
    const response = await adminClient.post("/api/library/scenes", {
      scene_filter: { not_a_field: { value: 1, modifier: "EQUALS" } },
    });

    expectRefused(response, ["scene_filter.not_a_field"]);
    expect(response.data).toMatchObject({ errorType: "VALIDATION_ERROR" });
  });

  it("a null modifier on performer tags behaves as INCLUDES", async () => {
    const tagged = await prisma.performerTag.findFirst({
      where: { performerInstanceId: testInstanceId },
      select: { tagId: true },
    });
    const tag = `${must(tagged, "a performer tag on the test instance").tagId}:${testInstanceId}`;

    const list = async (modifier: string | null) => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 250 },
          performer_filter: { tags: { value: [tag], modifier } },
        }
      );
      expect(response.status).toBe(200);
      return response.data.findPerformers;
    };
    const everyone = await adminClient.post<FindPerformersResponse>(
      "/api/library/performers",
      { filter: { per_page: 250 } }
    );

    const includes = await list("INCLUDES");
    expect(includes.count).toBeGreaterThan(0);
    expect(includes.count).toBeLessThan(everyone.data.findPerformers.count);

    const withNull = await list(null);
    expect(withNull.performers.map((p) => p.id)).toEqual(
      includes.performers.map((p) => p.id)
    );
  });

  it("a body that is a string answers 400", async () => {
    const response = await adminClient.post(
      "/api/library/scenes",
      untrusted<object>("scenes please")
    );

    expect(response.status).toBe(400);
  });

  it("a body that is a list answers 400 naming the body", async () => {
    const response = await adminClient.post("/api/library/scenes", [
      { filter: {} },
    ]);

    expectRefused(response, ["body"]);
  });

  describe("clips", () => {
    it("perPage abc answers 400", async () => {
      const response = await adminClient.get("/api/clips?perPage=abc");

      expectRefused(response, ["perPage"]);
    });

    it("perPage 1000 returns at most 250", async () => {
      const response = await adminClient.get<GetClipsResponse>(
        "/api/clips?perPage=1000"
      );

      expect(response.status).toBe(200);
      expect(response.data.perPage).toBe(250);
      expect(response.data.clips.length).toBeLessThanOrEqual(250);
      expect(response.data.totalPages).toBe(
        Math.ceil(response.data.total / 250)
      );
    });

    it("sortDir sideways answers 400", async () => {
      const response = await adminClient.get("/api/clips?sortDir=sideways");

      expectRefused(response, ["sortDir"]);
    });
  });

  describe("images by id on two instances", () => {
    let viewer: { id: number; client: TestClient } | undefined;

    beforeAll(async () => {
      await clearFixture();
      for (const [index, id] of INSTANCES.entries()) {
        await prisma.stashInstance.create({
          data: {
            id,
            name: id,
            url: "http://127.0.0.1:9/graphql",
            apiKey: "fixture-key",
            enabled: true,
            priority: 920 + index,
            // Synced: its content shows (a first-syncing instance does not)
            firstSyncedAt: new Date(),
          },
        });
        await prisma.stashImage.create({
          data: {
            id: IMAGE_ID,
            stashInstanceId: id,
            title: `Same id on ${id}`,
            filePath: `/images/${id}.jpg`,
          },
        });
      }
      // No instance selection: every enabled instance, both of these included
      viewer = await createApiUser(USERNAME, "listreq_it_pass_1");
    }, 60000);

    afterAll(async () => {
      await clearFixture();
    });

    it("two same-id images on two instances by bare id answer the 400 ambiguous lookup", async () => {
      const { client } = must(viewer, "the viewer");

      const response = await client.post<AmbiguousLookupResponse>(
        "/api/library/images",
        { ids: [IMAGE_ID] }
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toBe("Ambiguous lookup");
      expect(response.data.matches.map((m) => m.instanceId).sort()).toEqual([
        A,
        B,
      ]);
    });

    it("the image's instance_id picks one of them", async () => {
      const { client } = must(viewer, "the viewer");

      const response = await client.post<FindImagesResponse>(
        "/api/library/images",
        { ids: [IMAGE_ID], image_filter: { instance_id: B } }
      );

      expect(response.status).toBe(200);
      expect(
        response.data.findImages.images.map((i) => [i.id, i.instanceId])
      ).toEqual([[IMAGE_ID, B]]);
    });
  });
});
