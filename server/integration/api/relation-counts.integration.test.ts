/**
 * Detail pages count what the viewer can see (item 36, B19): `GET
 * /api/library/<type>s/:id/counts` answers, per tab of the page, the total
 * of the tab's list for the viewer, with the tab's own filter (the tab's
 * default: no sub-tags or sub-studios unless asked). A card (B13) and the
 * page it opens agree. Against the real test SQLite database and the HTTP
 * endpoints, as the users see them.
 *
 * Two StashInstance rows, enabled and past their first sync. rc-a holds:
 * - studio 1; tags 1 (parent), 2 (child of 1) and 3; performers 1 (tag
 *   1), 2 (tag 2) and 3 (tag 1); collections 1 (studio 1, tag 1) and 2;
 *   studio 1 carries tag 1
 * - scene 1: studio 1, performers 1 and 2, tag 1 of its own, inherits tag
 *   1, collection 1, gallery 1
 * - scene 2: studio 1, performer 1, tag 3 of its own, inherits tag 1,
 *   collection 1
 * - scene 3: performers 1 and 3, tag 3 of its own, collection 2, gallery 2
 * - scene 4: performer 2, tag 2 of its own, inherits tags 1 and 2
 * - gallery 1: studio 1, performer 1, tag 3, images 1 and 2; gallery 2:
 *   performer 2, tag 2, image 3
 * - images 1 and 2: studio 1, performer 1, tag 3; image 3: performer 2,
 *   tag 2; image 4: performer 1, tag 1
 * rc-b holds tag 1 on its scene 1, so the same ids name another tag there.
 *
 * The restricted user hides tag 3: the compute excludes tag 3, scenes 2
 * and 3, gallery 1 and images 1 and 2, then performer 3 and collection 2
 * as empty. The plain user has no exclusion inputs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { entityImageCountService } from "../../services/EntityImageCountService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { linkCountService } from "../../services/LinkCountService.js";
import { userHiddenEntityService } from "../../services/UserHiddenEntityService.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { mirrorInheritedTags } from "../helpers/inheritedTags.js";
import { TestClient, adminClient } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "rc-a";
const B = "rc-b";
const RESTRICTED = { username: "rc_restricted_user", password: "rc-pass-1" };
const PLAIN = { username: "rc_plain_user", password: "rc-pass-2" };

const ENTITY_TABLES = [
  "StashImage",
  "StashGallery",
  "StashScene",
  "StashGroup",
  "StashPerformer",
  "StashStudio",
  "StashTag",
];

const HIDDEN_TAG = "3";

/** The list endpoints, each with its response key and filter key */
const LISTS = {
  performer: ["performers", "findPerformers", "performer_filter"],
  studio: ["studios", "findStudios", "studio_filter"],
  tag: ["tags", "findTags", "tag_filter"],
  group: ["groups", "findGroups", "group_filter"],
  gallery: ["galleries", "findGalleries", "gallery_filter"],
  scene: ["scenes", "findScenes", "scene_filter"],
  image: ["images", "findImages", "image_filter"],
} as const;
type ListKind = keyof typeof LISTS;

type Counts = Record<string, number>;

interface Row {
  id: string;
  instanceId: string;
  [column: string]: unknown;
}

type ListResponse = Record<
  string,
  { count: number } & Record<string, Row[] | number>
>;

/** A tag page's tabs: the count's key, the tab's list */
const TAG_TABS: Array<[key: string, list: ListKind, column: string]> = [
  ["scenes", "scene", "scene_count"],
  ["galleries", "gallery", "gallery_count"],
  ["images", "image", "image_count"],
  ["performers", "performer", "performer_count"],
  ["studios", "studio", "studio_count"],
  ["groups", "group", "group_count"],
];

async function list(
  client: TestClient,
  kind: ListKind,
  body: Record<string, unknown>
): Promise<{ count: number; items: Row[] }> {
  const [path, key, filterKey] = LISTS[kind];
  const { ids, ...rest } = body;
  const response = await client.post<ListResponse>(`/api/library/${path}`, {
    ...(ids === undefined ? {} : { ids }),
    filter: { per_page: 50 },
    [filterKey]: rest,
  });
  expect(
    response.status,
    `${kind} list: ${JSON.stringify(response.data)}`
  ).toBe(200);
  const found = must(response.data[key], `${key} in the response`);
  const items = found[path];
  if (!Array.isArray(items)) throw new Error(`${key}.${path} is not a list`);
  return { count: found.count, items };
}

/** The total of the tab's list: the list filtered by the page's entity */
async function tabTotal(
  client: TestClient,
  kind: ListKind,
  field: string,
  ref: string,
  depth?: number
): Promise<number> {
  const { count } = await list(client, kind, {
    [field]: {
      value: [ref],
      modifier: "INCLUDES",
      ...(depth === undefined ? {} : { depth }),
    },
  });
  return count;
}

async function counts(
  client: TestClient,
  path: string
): Promise<{ status: number; data: unknown }> {
  const response = await client.get(path);
  return { status: response.status, data: response.data };
}

async function okCounts(client: TestClient, path: string): Promise<Counts> {
  const { status, data } = await counts(client, path);
  expect(status, `${path}: ${JSON.stringify(data)}`).toBe(200);
  return must((data as { counts?: Counts }).counts, "counts in the response");
}

async function junction(
  table: string,
  cols: [string, string, string, string],
  rows: Array<[string, string]>,
  instanceId = A
): Promise<void> {
  for (const [left, right] of rows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${table}" ("${cols[0]}", "${cols[1]}", "${cols[2]}", "${cols[3]}") VALUES (?, ?, ?, ?)`,
      left,
      instanceId,
      right,
      instanceId
    );
  }
}

const link = (near: string, far: string): [string, string, string, string] => [
  `${near}Id`,
  `${near}InstanceId`,
  `${far}Id`,
  `${far}InstanceId`,
];

async function removeSeed(): Promise<void> {
  await prisma.user.deleteMany({
    where: { username: { in: [RESTRICTED.username, PLAIN.username] } },
  });
  for (const table of ENTITY_TABLES) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "stashInstanceId" IN (?, ?)`,
      A,
      B
    );
  }
  await prisma.stashInstance.deleteMany({ where: { id: { in: [A, B] } } });
}

async function seed(): Promise<void> {
  for (const [priority, id] of [A, B].entries()) {
    await prisma.stashInstance.create({
      data: {
        id,
        name: id,
        url: `http://${id}.invalid/graphql`,
        apiKey: "x",
        enabled: true,
        priority: 970 + priority,
        firstSyncedAt: new Date(),
      },
    });
  }

  const on = (id: string, instanceId = A) => ({
    id,
    stashInstanceId: instanceId,
  });
  await prisma.stashStudio.createMany({
    data: [{ ...on("1"), name: "RC studio" }],
  });
  await prisma.stashTag.createMany({
    data: [
      { ...on("1"), name: "RC tag 1" },
      { ...on("2"), name: "RC tag 2", parentIds: JSON.stringify(["1"]) },
      { ...on(HIDDEN_TAG), name: "RC tag 3" },
      { ...on("1", B), name: "RC tag 1 on B" },
    ],
  });
  await prisma.stashPerformer.createMany({
    data: [
      { ...on("1"), name: "RC performer 1" },
      { ...on("2"), name: "RC performer 2" },
      { ...on("3"), name: "RC performer 3" },
    ],
  });
  await prisma.stashGroup.createMany({
    data: [
      { ...on("1"), name: "RC collection 1", studioId: "1" },
      { ...on("2"), name: "RC collection 2" },
    ],
  });
  await prisma.stashScene.createMany({
    data: [
      { ...on("1"), studioId: "1", inheritedTagIds: '["1"]' },
      { ...on("2"), studioId: "1", inheritedTagIds: '["1"]' },
      { ...on("3"), inheritedTagIds: "[]" },
      { ...on("4"), inheritedTagIds: '["1","2"]' },
      { ...on("1", B), inheritedTagIds: "[]" },
    ],
  });
  await mirrorInheritedTags([A, B]);
  await prisma.stashGallery.createMany({
    data: [{ ...on("1"), studioId: "1", studioInstanceId: A }, { ...on("2") }],
  });
  await prisma.stashImage.createMany({
    data: [
      { ...on("1"), studioId: "1", studioInstanceId: A },
      { ...on("2"), studioId: "1", studioInstanceId: A },
      { ...on("3") },
      { ...on("4") },
    ],
  });

  await junction("ScenePerformer", link("scene", "performer"), [
    ["1", "1"],
    ["1", "2"],
    ["2", "1"],
    ["3", "1"],
    ["3", "3"],
    ["4", "2"],
  ]);
  await junction("SceneTag", link("scene", "tag"), [
    ["1", "1"],
    ["2", HIDDEN_TAG],
    ["3", HIDDEN_TAG],
    ["4", "2"],
  ]);
  await junction("SceneTag", link("scene", "tag"), [["1", "1"]], B);
  await junction("SceneGroup", link("scene", "group"), [
    ["1", "1"],
    ["2", "1"],
    ["3", "2"],
  ]);
  await junction("SceneGallery", link("scene", "gallery"), [
    ["1", "1"],
    ["3", "2"],
  ]);
  await junction("ImageGallery", link("image", "gallery"), [
    ["1", "1"],
    ["2", "1"],
    ["3", "2"],
  ]);
  await junction("ImagePerformer", link("image", "performer"), [
    ["1", "1"],
    ["2", "1"],
    ["3", "2"],
    ["4", "1"],
  ]);
  await junction("ImageTag", link("image", "tag"), [
    ["1", HIDDEN_TAG],
    ["2", HIDDEN_TAG],
    ["3", "2"],
    ["4", "1"],
  ]);
  await junction("GalleryPerformer", link("gallery", "performer"), [
    ["1", "1"],
    ["2", "2"],
  ]);
  await junction("GalleryTag", link("gallery", "tag"), [
    ["1", HIDDEN_TAG],
    ["2", "2"],
  ]);
  await junction("PerformerTag", link("performer", "tag"), [
    ["1", "1"],
    ["2", "2"],
    ["3", "1"],
  ]);
  await junction("StudioTag", link("studio", "tag"), [["1", "1"]]);
  await junction("GroupTag", link("group", "tag"), [["1", "1"]]);

  // The image and live link counts, as the sync's post-steps keep them
  const refs = (...ids: string[]) => ids.map((id) => ({ id, instanceId: A }));
  await entityImageCountService.rebuildAllImageCounts({
    performers: refs("1", "2", "3"),
    studios: refs("1"),
    tags: [...refs("1", "2", HIDDEN_TAG), { id: "1", instanceId: B }],
  });
  await linkCountService.rebuildLinkCounts({
    performers: refs("1", "2", "3"),
    studios: refs("1"),
    tags: [...refs("1", "2", HIDDEN_TAG), { id: "1", instanceId: B }],
    groups: refs("1", "2"),
    galleries: refs("1", "2"),
  });
}

describeWithDb("GET /api/library/<type>s/:id/counts (integration)", () => {
  let plainId = 0;
  const restricted = new TestClient();
  const plain = new TestClient();

  async function createUser(user: {
    username: string;
    password: string;
  }): Promise<number> {
    const response = await adminClient.post<{ user?: { id: number } }>(
      "/api/user/create",
      { ...user, role: "USER" }
    );
    expect(response.ok, JSON.stringify(response.data)).toBe(true);
    return must(response.data.user, "the created user").id;
  }

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await removeSeed();
    await seed();
    const restrictedId = await createUser(RESTRICTED);
    plainId = await createUser(PLAIN);
    await restricted.login(RESTRICTED.username, RESTRICTED.password);
    await plain.login(PLAIN.username, PLAIN.password);
    await exclusionComputationService.saveRestrictions(restrictedId, [
      {
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: [`${HIDDEN_TAG}:${A}`],
        restrictEmpty: false,
      },
    ]);
  }, 120_000);

  afterAll(async () => {
    await removeSeed();
  }, 60_000);

  it("a restricted user's tag counts equal the totals of the tag's tab lists", async () => {
    const ref = `1:${A}`;
    const got = await okCounts(
      restricted,
      `/api/library/tags/1/counts?instanceId=${A}`
    );
    // Scene 1 (direct) and scene 4 (inherited); scene 2 is hidden. Performer
    // 3 is hidden as empty.
    expect(got).toEqual({
      scenes: 2,
      galleries: 0,
      images: 1,
      performers: 1,
      studios: 1,
      groups: 1,
    });
    for (const [key, kind] of TAG_TABS) {
      expect(got[key], `${key} against its tab`).toBe(
        await tabTotal(restricted, kind, "tags", ref)
      );
    }

    // The card, from a list of more than one tag, shows the same numbers
    const { items } = await list(restricted, "tag", {
      ids: [`1:${A}`, `2:${A}`],
    });
    const card = must(
      items.find((t) => t.id === "1"),
      "tag 1's card"
    );
    for (const [key, , column] of TAG_TABS) {
      expect(card[column], `card ${column}`).toBe(got[key]);
    }

    // And so does the detail page's own row (a lookup of one id)
    const detail = await list(restricted, "tag", { ids: [ref] });
    const row = must(detail.items[0], "the tag's detail row");
    for (const [key, , column] of TAG_TABS) {
      expect(row[column], `detail ${column}`).toBe(got[key]);
    }
  }, 60_000);

  it("a hidden performer's scenes drop from its studio's scene count", async () => {
    const path = `/api/library/studios/1/counts?instanceId=${A}`;
    const before = await okCounts(plain, path);
    expect(before.scenes).toBe(2);
    expect(before.performers).toBe(2);

    await userHiddenEntityService.hideEntity(plainId, "performer", "2", A);
    try {
      const after = await okCounts(plain, path);
      // Scene 1 has performer 2: hidden with it
      expect(after.scenes).toBe(1);
      expect(after.performers).toBe(1);
      expect(after.scenes).toBe(
        await tabTotal(plain, "scene", "studios", `1:${A}`)
      );
      expect(after.performers).toBe(
        await tabTotal(plain, "performer", "studios", `1:${A}`)
      );
    } finally {
      await userHiddenEntityService.unhideEntity(plainId, "performer", "2", A);
    }
    expect((await okCounts(plain, path)).scenes).toBe(2);
  }, 60_000);

  it("a count request for an entity the user cannot see answers 404", async () => {
    // Restricted: tag 3 itself, and collection 2 (empty once scene 3 is gone)
    expect(
      (
        await counts(
          restricted,
          `/api/library/tags/${HIDDEN_TAG}/counts?instanceId=${A}`
        )
      ).status
    ).toBe(404);
    expect(
      (await counts(restricted, `/api/library/groups/2/counts?instanceId=${A}`))
        .status
    ).toBe(404);
    // No such entity, and one on the other instance only
    expect(
      (await counts(plain, `/api/library/performers/99/counts?instanceId=${A}`))
        .status
    ).toBe(404);
    expect(
      (await counts(plain, `/api/library/performers/1/counts?instanceId=${B}`))
        .status
    ).toBe(404);
    // The plain user sees them
    expect(
      (await counts(plain, `/api/library/groups/2/counts?instanceId=${A}`))
        .status
    ).toBe(200);
  });

  it("names its instance and takes only its own options", async () => {
    // The same id on another instance is another tag
    expect(
      await okCounts(plain, `/api/library/tags/1/counts?instanceId=${B}`)
    ).toMatchObject({ scenes: 1, performers: 0 });
    for (const path of [
      "/api/library/tags/1/counts",
      `/api/library/tags/1/counts?instanceId=${A}&includeSubStudios=true`,
      `/api/library/studios/1/counts?instanceId=${A}&includeSubTags=true`,
      `/api/library/tags/1/counts?instanceId=${A}&includeSubTags=yes`,
      `/api/library/tags/1/counts?instanceId=${A}&other=1`,
    ]) {
      expect((await counts(plain, path)).status, path).toBe(400);
    }
  });

  it("include sub-tags counts the sub-tags' scenes as the tab does", async () => {
    const ref = `1:${A}`;
    const got = await okCounts(
      restricted,
      `/api/library/tags/1/counts?instanceId=${A}&includeSubTags=true`
    );
    // Tag 2 adds performer 2, gallery 2 and image 3
    expect(got).toEqual({
      scenes: 2,
      galleries: 1,
      images: 2,
      performers: 2,
      studios: 1,
      groups: 1,
    });
    for (const [key, kind] of TAG_TABS) {
      expect(got[key], `${key} against its tab`).toBe(
        await tabTotal(restricted, kind, "tags", ref, -1)
      );
    }
  }, 60_000);

  it("every page's counts equal its tabs for each user", async () => {
    const pages: Array<
      [path: string, field: string, id: string, tabs: Array<[string, ListKind]>]
    > = [
      [
        "performers",
        "performers",
        "1",
        [
          ["scenes", "scene"],
          ["galleries", "gallery"],
          ["images", "image"],
          ["groups", "group"],
        ],
      ],
      [
        "studios",
        "studios",
        "1",
        [
          ["scenes", "scene"],
          ["galleries", "gallery"],
          ["images", "image"],
          ["performers", "performer"],
          ["groups", "group"],
        ],
      ],
      [
        "groups",
        "groups",
        "1",
        [
          ["scenes", "scene"],
          ["performers", "performer"],
        ],
      ],
      [
        "galleries",
        "galleries",
        "2",
        [
          ["images", "image"],
          ["scenes", "scene"],
        ],
      ],
    ];
    for (const client of [restricted, plain]) {
      for (const [path, field, id, tabs] of pages) {
        const got = await okCounts(
          client,
          `/api/library/${path}/${id}/counts?instanceId=${A}`
        );
        expect(Object.keys(got).sort()).toEqual(tabs.map(([k]) => k).sort());
        for (const [key, kind] of tabs) {
          expect(got[key], `${path} ${id} ${key}`).toBe(
            await tabTotal(client, kind, field, `${id}:${A}`)
          );
        }
      }
    }
  }, 60_000);
});
