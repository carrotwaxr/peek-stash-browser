import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { expectRefused } from "../helpers/refused.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

/**
 * Text Search Filters Integration Tests
 *
 * Tests text/string search filters across entities:
 * - title filter (scenes, galleries, groups)
 * - name filter (performers, studios, tags)
 * - details filter (description/notes)
 * - Query parameter (global search)
 * - String modifiers: EQUALS, NOT_EQUALS, INCLUDES, EXCLUDES, IS_NULL, NOT_NULL
 * - Stash's url, aliases and stash_id filters and MATCHES_REGEX, which Peek
 *   refuses (400)
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      details?: string;
      url?: string;
    }>;
    count: number;
  };
}

interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      details?: string;
      url?: string;
      aliases?: string;
    }>;
    count: number;
  };
}

interface FindStudiosResponse {
  findStudios: {
    studios: Array<{
      id: string;
      name: string;
      details?: string;
      url?: string;
    }>;
    count: number;
  };
}

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      description?: string;
      aliases?: string[];
    }>;
    count: number;
  };
}

describe("Text Search Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("scene title filter", () => {
    it("filters by title INCLUDES (partial match)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            title: {
              value: "a",
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by title EXCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            title: {
              value: "test",
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by title IS_NULL (no title)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            title: {
              value: "",
              modifier: "IS_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by title NOT_NULL (has title)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            title: {
              value: "",
              modifier: "NOT_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("scene details filter", () => {
    it("filters by details INCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            details: {
              value: "the",
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by details IS_NULL (no description)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            details: {
              value: "",
              modifier: "IS_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("performer name filter", () => {
    it("filters by name INCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            name: {
              value: "a",
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });
  });

  describe("name and title filters take % _ [ literally and read aliases one by one", () => {
    const performerNames = async (name: {
      value: string;
      modifier: string;
    }): Promise<FindPerformersResponse["findPerformers"]> => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        { filter: { per_page: 500 }, performer_filter: { name } }
      );
      expect(response.ok).toBe(true);
      return response.data.findPerformers;
    };

    it("name `[` matches no performer whose name lacks it", async () => {
      // No name or alias in the synthetic library holds a bracket: the
      // alias lists' JSON punctuation (`["..."]`) is not text to match
      const { performers, count } = await performerNames({
        value: "[",
        modifier: "INCLUDES",
      });

      expect(count).toBe(0);
      expect(performers).toEqual([]);
    });

    it("name matches an alias", async () => {
      // The synthetic aliases read "<name> alias <n>"; no name has the word
      const { performers, count } = await performerNames({
        value: "alias",
        modifier: "INCLUDES",
      });

      expect(count).toBeGreaterThan(0);
      for (const performer of performers) {
        expect(performer.name).not.toContain("alias");
      }
    });

    it("name `_` and `%` match only names holding them", async () => {
      for (const value of ["_", "%"]) {
        const { count } = await performerNames({ value, modifier: "INCLUDES" });
        expect(count).toBe(0);
      }
    });

    it("title `_` matches only titles with an underscore", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: { title: { value: "_", modifier: "INCLUDES" } },
        }
      );

      expect(response.ok).toBe(true);
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.title).toContain("_");
      }
      expect(response.data.findScenes.count).toBe(
        response.data.findScenes.scenes.length
      );
    });
  });

  describe("studio name filter", () => {
    it("filters by name INCLUDES", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: { per_page: 50 },
          studio_filter: {
            name: {
              value: "a",
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("tag name filter", () => {
    it("filters by name INCLUDES", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            name: {
              value: "a",
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });

    it("filters by name EQUALS (exact match)", async () => {
      // First get a tag to know an exact name, on the test instance: the
      // second library reuses the test library's ids, so a bare id can match
      // one on each instance (the ambiguous-lookup 400)
      const instanceId = await findTestInstanceId();
      const initial = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          ids: [`${TEST_ENTITIES.tagWithEntities}:${instanceId}`],
        }
      );
      expect(initial.status).toBe(200);

      const tagName = must(
        initial.data.findTags.tags[0],
        "tagWithEntities"
      ).name;

      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: { per_page: 50 },
          tag_filter: {
            name: {
              value: tagName,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags.count).toBeGreaterThan(0);
    });
  });

  describe("Stash text filters Peek does not apply", () => {
    // The request parser refuses them rather than ignore them: no builder
    // has a clause for these fields or for MATCHES_REGEX
    it.each([
      {
        path: "scene_filter.title.modifier",
        list: "scenes",
        body: {
          scene_filter: {
            title: { value: "^[A-Z].*", modifier: "MATCHES_REGEX" },
          },
        },
      },
      {
        path: "scene_filter.url",
        list: "scenes",
        body: {
          scene_filter: { url: { value: "http", modifier: "INCLUDES" } },
        },
      },
      {
        path: "scene_filter.stash_id_endpoint",
        list: "scenes",
        body: { scene_filter: { stash_id_endpoint: { modifier: "NOT_NULL" } } },
      },
      {
        path: "performer_filter.name.modifier",
        list: "performers",
        body: {
          performer_filter: {
            name: { value: "^[A-Z]", modifier: "MATCHES_REGEX" },
          },
        },
      },
    ])("$path answers 400 naming it", async ({ path, list, body }) => {
      const response = await adminClient.post(`/api/library/${list}`, {
        filter: { per_page: 50 },
        ...body,
      });

      expectRefused(response, [path]);
    });
  });

  describe("query parameter (global search)", () => {
    it("searches scenes with q parameter", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
            q: "scene",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("searches performers with q parameter", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 50,
            q: "performer",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("combined text filters", () => {
    it("combines title and details filters", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            title: {
              value: "",
              modifier: "NOT_NULL",
            },
            details: {
              value: "",
              modifier: "NOT_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines text filter with entity filter", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            title: {
              value: "a",
              modifier: "INCLUDES",
            },
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * The search box on seeded rows: every word must match, a quoted phrase
 * must appear whole, a non-ASCII capital matches as typed, and a name found
 * through a relation counts only for the scene's own instance and for what
 * the viewer can see.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do.
 * - ts-a performers: 7896201 "TS Anna", 7896202 "Élodie TS", 7896203 "TS
 *   Pam" (the viewer hid it)
 * - ts-a tags: 7896001 "TS blonde", 7896002 "TS plain"; ts-b tag 7896002
 *   "TS needle"
 * - ts-a scenes: 7896301 "TS one" (performer Anna, tag blonde); 7896302
 *   "TS two" (Anna only); 7896303 "TS blonde anna" (no relations); 7896304
 *   "TS anna blonde here"; 7896305 "TS five" (performer Élodie); 7896306
 *   "TS six" (tag plain, the id ts-b names "needle"); 7896307 "TS seven"
 *   (the hidden performer Pam)
 * - ts-b scene 7896301 "TS b one" (tag 7896002, "needle")
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Search box (seeded)", () => {
  const A = "ts-a";
  const B = "ts-b";
  const VIEWER = "ts-viewer";
  let viewerId = 0;

  const key = (id: string, instance: string) => `${id}:${instance}`;

  async function removeRows(): Promise<void> {
    const where = { stashInstanceId: { in: [A, B] } };
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashTag.deleteMany({ where });
    await prisma.stashPerformer.deleteMany({ where });
    await prisma.user.deleteMany({ where: { username: VIEWER } });
  }

  /** The scenes a search lists for the viewer, as sorted keys */
  async function search(q: string, applyExclusions = true): Promise<string[]> {
    const { items, total } = await sceneQueryBuilder.execute({
      userId: viewerId,
      applyExclusions,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("scene", { perPage: 50, q }),
    });
    expect(total).toBe(items.length);
    return items.map((s) => key(s.id, s.instanceId)).sort();
  }

  beforeAll(async () => {
    await removeRows();
    viewerId = (
      await prisma.user.create({
        data: { username: VIEWER, password: "not-a-real-hash", role: "USER" },
      })
    ).id;
    await prisma.stashPerformer.createMany({
      data: [
        { id: "7896201", stashInstanceId: A, name: "TS Anna" },
        { id: "7896202", stashInstanceId: A, name: "Élodie TS" },
        { id: "7896203", stashInstanceId: A, name: "TS Pam" },
      ],
    });
    await prisma.stashTag.createMany({
      data: [
        { id: "7896001", stashInstanceId: A, name: "TS blonde" },
        { id: "7896002", stashInstanceId: A, name: "TS plain" },
        { id: "7896002", stashInstanceId: B, name: "TS needle" },
      ],
    });
    const scene = (id: string, instance: string, title: string) => ({
      id,
      stashInstanceId: instance,
      title,
    });
    await prisma.stashScene.createMany({
      data: [
        scene("7896301", A, "TS one"),
        scene("7896302", A, "TS two"),
        scene("7896303", A, "TS blonde anna"),
        scene("7896304", A, "TS anna blonde here"),
        scene("7896305", A, "TS five"),
        scene("7896306", A, "TS six"),
        scene("7896307", A, "TS seven"),
        scene("7896301", B, "TS b one"),
      ],
    });
    const performer = (scene: string, performerId: string) => ({
      sceneId: scene,
      sceneInstanceId: A,
      performerId,
      performerInstanceId: A,
    });
    await prisma.scenePerformer.createMany({
      data: [
        performer("7896301", "7896201"),
        performer("7896302", "7896201"),
        performer("7896305", "7896202"),
        performer("7896307", "7896203"),
      ],
    });
    const tag = (scene: string, instance: string, tagId: string) => ({
      sceneId: scene,
      sceneInstanceId: instance,
      tagId,
      tagInstanceId: instance,
    });
    await prisma.sceneTag.createMany({
      data: [
        tag("7896301", A, "7896001"),
        tag("7896306", A, "7896002"),
        tag("7896301", B, "7896002"),
      ],
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId: viewerId,
        entityType: "performer",
        entityId: "7896203",
        instanceId: A,
        reason: "hidden",
      },
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("a scene matches words found in different places", async () => {
    // "anna" is a performer's name and "blonde" a tag's name on 7896301; the
    // title holds both words on 7896303 and 7896304
    expect(await search("anna blonde")).toEqual(
      [key("7896301", A), key("7896303", A), key("7896304", A)].sort()
    );
  });

  it("a scene lacking one of the words does not match", async () => {
    expect(await search("anna blonde")).not.toContain(key("7896302", A));
  });

  it("a quoted phrase must appear whole", async () => {
    expect(await search('"anna blonde"')).toEqual([key("7896304", A)]);
  });

  it("a non-ASCII capital typed exactly matches", async () => {
    expect(await search("Élodie")).toEqual([key("7896305", A)]);
  });

  it("a tag name from the other instance with the same tag id does not make a scene match", async () => {
    // ts-b names tag 7896002 "TS needle"; ts-a's scene 7896306 holds ts-a's
    // tag 7896002, "TS plain"
    expect(await search("needle")).toEqual([key("7896301", B)]);
  });

  it("a performer the viewer hid does not make a scene match by name", async () => {
    expect(await search("pam")).toEqual([]);
    expect(await search("pam", false)).toEqual([key("7896307", A)]);
  });

  it("the performer list matches a non-ASCII capital typed exactly, with another word too", async () => {
    const ids = async (q: string) =>
      (
        await performerQueryBuilder.execute({
          userId: viewerId,
          applyExclusions: true,
          allowedInstanceIds: [A, B],
          request: parsedListRequest("performer", { perPage: 50, q }),
        })
      ).items.map((p) => p.id);

    expect(await ids("Élodie")).toEqual(["7896202"]);
    expect(await ids("ts Élodie")).toEqual(["7896202"]);
    expect(await ids("Élodie nope")).toEqual([]);
  });
});

/**
 * The studio and collection search finds a row by its aliases: a studio's one
 * at a time (the list's punctuation never matches), a collection's as Stash's
 * single text, each word of the box on its own. A row the viewer hid is never
 * found by its alias, and another instance's alias never counts.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do.
 * - as-a studios: 7903001 "AS one" (aliases "Alpha One" and "Second Name"),
 *   7903002 "AS two" (no aliases), 7903003 (hidden by the viewer, alias
 *   "Alpha Hidden"); as-b studio 7903001 "AS b one" (alias "Zulu")
 * - as-a collections: 7903101 "AS group one" (aliases "Old Name, Other"),
 *   7903102 "AS group two", 7903103 (hidden by the viewer, aliases "Old
 *   Hidden"); as-b collection 7903101 (aliases "Zulu")
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Studio and collection search by alias (seeded)", () => {
  const A = "as-a";
  const B = "as-b";
  const VIEWER = "as-viewer";
  let viewerId = 0;

  const key = (id: string, instance: string) => `${id}:${instance}`;

  async function removeRows(): Promise<void> {
    const where = { stashInstanceId: { in: [A, B] } };
    await prisma.stashStudio.deleteMany({ where });
    await prisma.stashGroup.deleteMany({ where });
    await prisma.user.deleteMany({ where: { username: VIEWER } });
  }

  async function studios(q: string, applyExclusions = true): Promise<string[]> {
    const { items, total } = await studioQueryBuilder.execute({
      userId: viewerId,
      applyExclusions,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("studio", { perPage: 50, q }),
    });
    expect(total).toBe(items.length);
    return items.map((s) => key(s.id, s.instanceId)).sort();
  }

  async function groups(q: string, applyExclusions = true): Promise<string[]> {
    const { items, total } = await groupQueryBuilder.execute({
      userId: viewerId,
      applyExclusions,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("group", { perPage: 50, q }),
    });
    expect(total).toBe(items.length);
    return items.map((g) => key(g.id, g.instanceId)).sort();
  }

  beforeAll(async () => {
    await removeRows();
    viewerId = (
      await prisma.user.create({
        data: { username: VIEWER, password: "not-a-real-hash", role: "USER" },
      })
    ).id;
    await prisma.stashStudio.createMany({
      data: [
        {
          id: "7903001",
          stashInstanceId: A,
          name: "AS one",
          aliases: JSON.stringify(["Alpha One", "Second Name"]),
        },
        { id: "7903002", stashInstanceId: A, name: "AS two" },
        {
          id: "7903003",
          stashInstanceId: A,
          name: "AS three",
          aliases: JSON.stringify(["Alpha Hidden"]),
        },
        {
          id: "7903001",
          stashInstanceId: B,
          name: "AS b one",
          aliases: JSON.stringify(["Zulu"]),
        },
      ],
    });
    await prisma.stashGroup.createMany({
      data: [
        {
          id: "7903101",
          stashInstanceId: A,
          name: "AS group one",
          aliases: "Old Name, Other",
        },
        { id: "7903102", stashInstanceId: A, name: "AS group two" },
        {
          id: "7903103",
          stashInstanceId: A,
          name: "AS group three",
          aliases: "Old Hidden",
        },
        {
          id: "7903101",
          stashInstanceId: B,
          name: "AS group b one",
          aliases: "Zulu",
        },
      ],
    });
    await prisma.userExcludedEntity.createMany({
      data: [
        {
          userId: viewerId,
          entityType: "studio",
          entityId: "7903003",
          instanceId: A,
          reason: "hidden",
        },
        {
          userId: viewerId,
          entityType: "group",
          entityId: "7903103",
          instanceId: A,
          reason: "hidden",
        },
      ],
    });
  });

  afterAll(removeRows);

  it("studio search finds a studio by an alias, per alias", async () => {
    expect(await studios("alpha")).toEqual([key("7903001", A)]);
    expect(await studios("second")).toEqual([key("7903001", A)]);
    // Words may be found in different places: the name and an alias
    expect(await studios("one second")).toEqual([key("7903001", A)]);
    // The alias list's JSON punctuation never matches
    for (const q of ['"', "[", "]", ",", '"]', '","']) {
      expect(await studios(q)).toEqual([]);
    }
  });

  it("studio search by an alias on one instance never finds the other's studio of the same id", async () => {
    expect(await studios("zulu")).toEqual([key("7903001", B)]);
  });

  it("a studio the viewer hid is never found by its alias", async () => {
    expect(await studios("hidden")).toEqual([]);
    expect(await studios("hidden", false)).toEqual([key("7903003", A)]);
  });

  it("collection search finds a collection by its aliases text", async () => {
    expect(await groups("name, oth")).toEqual([key("7903101", A)]);
    // The box splits words, each matched in the text
    expect(await groups("other old")).toEqual([key("7903101", A)]);
    expect(await groups("old nope")).toEqual([]);
  });

  it("a collection search by an alias on one instance never finds the other's, and a hidden one is never found", async () => {
    expect(await groups("zulu")).toEqual([key("7903101", B)]);
    expect(await groups("hidden")).toEqual([]);
    expect(await groups("hidden", false)).toEqual([key("7903103", A)]);
  });
});
