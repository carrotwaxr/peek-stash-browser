/**
 * The viewer's excluded links per entity (item 36, B13b): a card's count is
 * the live count column (B13a) minus the viewer's excluded links, stored in
 * UserExcludedContentCount, so it equals the total of the tab behind the
 * card. Against the real test SQLite database and the HTTP list endpoints,
 * as the users see them.
 *
 * Two StashInstance rows, enabled and past their first sync, so every
 * user's lists cover them. ec-a holds the library:
 * - studios 1 and 2 (2 links nothing); tags 1 (parent), 2 (child of 1) and
 *   3; performers 1 (tag 1),
 *   2 and 3 (tag 1); collections 1 (studio 1) and 2
 * - scene 1: studio 1, performers 1 and 2, tag 1 of its own, inherits tag
 *   1, collection 1
 * - scene 2: studio 1, performer 1, tag 3 of its own, inherits tag 1,
 *   collection 1
 * - scene 3: performers 1 and 3, tag 3 of its own, collection 2
 * - scene 4: performer 2, tag 2 of its own, inherits tags 1 and 2
 * - gallery 1: studio 1, performer 1, tag 3, images 1 and 2; gallery 2:
 *   performer 2, image 3
 * - images 1 and 2: studio 1, performer 1, tag 3; image 3: performer 2;
 *   image 4: performer 1, tag 1
 * ec-b holds performer 1 on its scene 1 only.
 *
 * The restricted user always hides tag 3: the compute excludes tag 3, its
 * scenes 2 and 3, gallery 1 and images 1 and 2, then performer 3 and
 * collection 2 as empty. The plain user has no exclusion inputs.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getComputeClient } from "../../prisma/computeClient.js";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { linkCountService } from "../../services/LinkCountService.js";
import { userHiddenEntityService } from "../../services/UserHiddenEntityService.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { TestClient, adminClient } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "ec-a";
const B = "ec-b";
const RESTRICTED = { username: "ec_restricted_user", password: "ec-pass-1" };
const PLAIN = { username: "ec_plain_user", password: "ec-pass-2" };

const ENTITY_TABLES = [
  "StashClip",
  "StashImage",
  "StashGallery",
  "StashScene",
  "StashGroup",
  "StashPerformer",
  "StashStudio",
  "StashTag",
];

/** The tag the restricted user always hides */
const HIDDEN_TAG = "3";

/** A count row as stored, without its key */
interface CountRow {
  scenes: number;
  images: number;
  galleries: number;
  groups: number;
  performers: number;
  studios: number;
}

interface Counted {
  id: string;
  scene_count?: number;
  image_count?: number;
  gallery_count?: number;
  group_count?: number;
  performer_count?: number;
  studio_count?: number;
}

type ListResponse = Record<
  string,
  { count: number } & Record<string, Counted[] | number>
>;

/** The list endpoints, each with its response key, list key and filter key */
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

/** The relation each count column of a card names, as the tab's filter key */
const CARD_TABS: Record<
  Exclude<ListKind, "scene" | "image">,
  Array<[column: keyof Counted, tab: ListKind]>
> = {
  performer: [
    ["scene_count", "scene"],
    ["image_count", "image"],
    ["gallery_count", "gallery"],
    ["group_count", "group"],
  ],
  studio: [
    ["scene_count", "scene"],
    ["image_count", "image"],
    ["gallery_count", "gallery"],
    ["group_count", "group"],
    ["performer_count", "performer"],
  ],
  tag: [
    ["scene_count", "scene"],
    ["image_count", "image"],
    ["gallery_count", "gallery"],
    ["group_count", "group"],
    ["performer_count", "performer"],
    ["studio_count", "studio"],
  ],
  group: [
    ["scene_count", "scene"],
    ["performer_count", "performer"],
  ],
  gallery: [["image_count", "image"]],
};

/** The filter key a tab's list takes for its parent entity */
const TAB_FILTER_KEY: Record<Exclude<ListKind, "scene" | "image">, string> = {
  performer: "performers",
  studio: "studios",
  tag: "tags",
  group: "groups",
  gallery: "galleries",
};

async function list(
  client: TestClient,
  kind: ListKind,
  body: Record<string, unknown>
): Promise<{ count: number; items: Counted[] }> {
  const [path, key, filterKey] = LISTS[kind];
  const { filter, ids, ...rest } = body;
  const response = await client.post<ListResponse>(`/api/library/${path}`, {
    ...(ids === undefined ? {} : { ids }),
    filter: { per_page: 50, ...(filter as Record<string, unknown>) },
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

/** The seed's ids per card type */
const SEED_IDS: Record<keyof typeof CARD_TABS, string[]> = {
  performer: ["1", "2", "3"],
  studio: ["1", "2"],
  tag: ["1", "2", HIDDEN_TAG],
  group: ["1", "2"],
  gallery: ["1", "2"],
};

/**
 * One entity's card, by ref, as the grid shows it (null when hidden): the
 * list asked for every seeded id of the type. A detail lookup (a one-id
 * list) answers the same row, so the choice does not change the counts.
 */
async function card(
  client: TestClient,
  kind: Exclude<ListKind, "scene" | "image">,
  ref: string
): Promise<Counted | null> {
  const [id, instanceId] = ref.split(":");
  const { items } = await list(client, kind, {
    ids: SEED_IDS[kind].map((seeded) => `${seeded}:${instanceId}`),
  });
  return items.find((item) => item.id === id) ?? null;
}

/** The total of the tab behind a card: the tab's list filtered by the card's entity */
async function tab(
  client: TestClient,
  kind: Exclude<ListKind, "scene" | "image">,
  ref: string,
  tabKind: ListKind
): Promise<number> {
  const { count } = await list(client, tabKind, {
    [TAB_FILTER_KEY[kind]]: { value: [ref], modifier: "INCLUDES" },
  });
  return count;
}

/**
 * Every count of every card of the seed the client can see, against the
 * total of the tab behind it: `[label, card, tab]` for each pair.
 */
async function cardsAndTabs(
  client: TestClient
): Promise<Array<[string, number | undefined, number]>> {
  const out: Array<[string, number | undefined, number]> = [];
  for (const kind of Object.keys(CARD_TABS) as Array<keyof typeof CARD_TABS>) {
    const { items } = await list(client, kind, {
      ids: SEED_IDS[kind].map((id) => `${id}:${A}`),
    });
    for (const item of items) {
      const ref = `${item.id}:${A}`;
      for (const [column, tabKind] of CARD_TABS[kind]) {
        out.push([
          `${kind} ${item.id} ${column}`,
          item[column] as number | undefined,
          await tab(client, kind, ref, tabKind),
        ]);
      }
    }
  }
  return out;
}

async function countRows(userId: number): Promise<Map<string, CountRow>> {
  const rows = await prisma.userExcludedContentCount.findMany({
    where: { userId },
  });
  return new Map(
    rows.map((r) => [
      `${r.entityType}:${r.entityId}:${r.instanceId}`,
      {
        scenes: r.scenes,
        images: r.images,
        galleries: r.galleries,
        groups: r.groups,
        performers: r.performers,
        studios: r.studios,
      },
    ])
  );
}

const zero: CountRow = {
  scenes: 0,
  images: 0,
  galleries: 0,
  groups: 0,
  performers: 0,
  studios: 0,
};

/** Record the statements the compute connection runs until `restore()` */
async function recordCompute() {
  const computeClient = await getComputeClient();
  const original = computeClient.$executeRawUnsafe.bind(computeClient);
  const exec = vi.fn(original);
  computeClient.$executeRawUnsafe = exec;
  return {
    sqls: () => exec.mock.calls.map(([sql]) => sql),
    restore: () => {
      computeClient.$executeRawUnsafe = original;
    },
  };
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
        priority: 960 + priority,
        firstSyncedAt: new Date(),
      },
    });
  }

  const on = (id: string, instanceId = A) => ({
    id,
    stashInstanceId: instanceId,
  });
  // Studio 2 links nothing: it keeps the studio card reads a list of two
  await prisma.stashStudio.createMany({
    data: [
      { ...on("1"), name: "EC studio", imageCount: 2 },
      { ...on("2"), name: "EC studio 2" },
    ],
  });
  await prisma.stashTag.createMany({
    data: [
      { ...on("1"), name: "EC tag 1", imageCount: 1 },
      { ...on("2"), name: "EC tag 2", parentIds: JSON.stringify(["1"]) },
      { ...on(HIDDEN_TAG), name: "EC tag 3", imageCount: 2 },
    ],
  });
  await prisma.stashPerformer.createMany({
    data: [
      { ...on("1"), name: "EC performer 1", imageCount: 3 },
      { ...on("2"), name: "EC performer 2", imageCount: 1 },
      { ...on("3"), name: "EC performer 3" },
      { ...on("1", B), name: "EC performer 1 on B" },
    ],
  });
  await prisma.stashGroup.createMany({
    data: [
      { ...on("1"), name: "EC collection 1", studioId: "1" },
      { ...on("2"), name: "EC collection 2" },
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

  const sceneCols: [string, string, string, string] = [
    "sceneId",
    "sceneInstanceId",
    "",
    "",
  ];
  const scene = (far: string): [string, string, string, string] => [
    sceneCols[0],
    sceneCols[1],
    `${far}Id`,
    `${far}InstanceId`,
  ];
  await junction("ScenePerformer", scene("performer"), [
    ["1", "1"],
    ["1", "2"],
    ["2", "1"],
    ["3", "1"],
    ["3", "3"],
    ["4", "2"],
  ]);
  await junction("ScenePerformer", scene("performer"), [["1", "1"]], B);
  await junction("SceneTag", scene("tag"), [
    ["1", "1"],
    ["2", HIDDEN_TAG],
    ["3", HIDDEN_TAG],
    ["4", "2"],
  ]);
  await junction("SceneGroup", scene("group"), [
    ["1", "1"],
    ["2", "1"],
    ["3", "2"],
  ]);
  const image = (far: string): [string, string, string, string] => [
    "imageId",
    "imageInstanceId",
    `${far}Id`,
    `${far}InstanceId`,
  ];
  await junction("ImageGallery", image("gallery"), [
    ["1", "1"],
    ["2", "1"],
    ["3", "2"],
  ]);
  await junction("ImagePerformer", image("performer"), [
    ["1", "1"],
    ["2", "1"],
    ["3", "2"],
    ["4", "1"],
  ]);
  await junction("ImageTag", image("tag"), [
    ["1", HIDDEN_TAG],
    ["2", HIDDEN_TAG],
    ["4", "1"],
  ]);
  const gallery = (far: string): [string, string, string, string] => [
    "galleryId",
    "galleryInstanceId",
    `${far}Id`,
    `${far}InstanceId`,
  ];
  await junction("GalleryPerformer", gallery("performer"), [
    ["1", "1"],
    ["2", "2"],
  ]);
  await junction("GalleryTag", gallery("tag"), [["1", HIDDEN_TAG]]);
  await junction(
    "PerformerTag",
    ["performerId", "performerInstanceId", "tagId", "tagInstanceId"],
    [
      ["1", "1"],
      ["3", "1"],
    ]
  );

  // The live link counts, as the sync's post-steps keep them
  const refs = (...ids: string[]) => ids.map((id) => ({ id, instanceId: A }));
  await linkCountService.rebuildLinkCounts({
    performers: [...refs("1", "2", "3"), { id: "1", instanceId: B }],
    studios: refs("1", "2"),
    tags: refs("1", "2", HIDDEN_TAG),
    groups: refs("1", "2"),
    galleries: refs("1", "2"),
  });
}

describeWithDb("UserExcludedContentCount (integration)", () => {
  let restrictedId = 0;
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
    restrictedId = await createUser(RESTRICTED);
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

  it("stores the restricted user's excluded links per entity: only entities with a nonzero column", async () => {
    const rows = await countRows(restrictedId);
    // Performer 1: scenes 2 and 3, gallery 1, images 1 and 2, collection 2
    expect(rows.get(`performer:1:${A}`)).toEqual({
      ...zero,
      scenes: 2,
      galleries: 1,
      images: 2,
      groups: 1,
    });
    // Performer 2: nothing of its own is hidden
    expect(rows.has(`performer:2:${A}`)).toBe(false);
    // Studio 1: scene 2, gallery 1, images 1 and 2
    expect(rows.get(`studio:1:${A}`)).toEqual({
      ...zero,
      scenes: 1,
      galleries: 1,
      images: 2,
    });
    // Tag 1: scene 2 (inherited only), performer 3 (empty)
    expect(rows.get(`tag:1:${A}`)).toEqual({
      ...zero,
      scenes: 1,
      performers: 1,
    });
    // Collection 1: scene 2; collection 2 is itself excluded, its row stays
    expect(rows.get(`group:1:${A}`)).toEqual({ ...zero, scenes: 1 });
    expect(rows.get(`group:2:${A}`)).toEqual({
      ...zero,
      scenes: 1,
      performers: 1,
    });
    // Gallery 1: images 1 and 2
    expect(rows.get(`gallery:1:${A}`)).toEqual({ ...zero, images: 2 });
    expect(rows.has(`gallery:2:${A}`)).toBe(false);
    // Nothing on B, where the user's restriction reaches nothing
    expect([...rows.keys()].filter((k) => k.endsWith(`:${B}`))).toEqual([]);
  });

  it("a restricted user's performer card count equals the performer's scene list total, and a tag's with a scene that inherits the tag", async () => {
    const performer = await card(restricted, "performer", `1:${A}`);
    expect(performer).toMatchObject({
      scene_count: 1,
      image_count: 1,
      gallery_count: 0,
      group_count: 1,
    });
    expect(await tab(restricted, "performer", `1:${A}`, "scene")).toBe(1);
    expect(await tab(restricted, "performer", `1:${A}`, "image")).toBe(1);
    expect(await tab(restricted, "performer", `1:${A}`, "gallery")).toBe(0);
    expect(await tab(restricted, "performer", `1:${A}`, "group")).toBe(1);

    // Tag 1: scene 1 (direct), scene 4 (inherited); scene 2 is hidden
    const tag = await card(restricted, "tag", `1:${A}`);
    expect(tag).toMatchObject({ scene_count: 2, performer_count: 1 });
    expect(await tab(restricted, "tag", `1:${A}`, "scene")).toBe(2);

    // Every card the user sees, every count, against its tab
    const pairs = await cardsAndTabs(restricted);
    expect(pairs.length).toBeGreaterThan(10);
    expect(pairs.filter(([, shown, listed]) => shown !== listed)).toEqual([]);
  }, 60_000);

  it("sorting performers by scene count orders by the visible number, and a scene_count filter reads it", async () => {
    const ids = [`1:${A}`, `2:${A}`];
    const sorted = { sort: "scene_count", direction: "DESC" };
    // Performer 1 has 3 live scenes, 1 visible; performer 2 has 2 of each
    const asRestricted = await list(restricted, "performer", {
      ids,
      filter: sorted,
    });
    expect(asRestricted.items.map((p) => p.id)).toEqual(["2", "1"]);
    const asPlain = await list(plain, "performer", { ids, filter: sorted });
    expect(asPlain.items.map((p) => p.id)).toEqual(["1", "2"]);

    const above1 = { scene_count: { value: 1, modifier: "GREATER_THAN" } };
    const filteredRestricted = await list(restricted, "performer", {
      ids,
      ...above1,
    });
    expect(filteredRestricted.items.map((p) => p.id)).toEqual(["2"]);
    expect(filteredRestricted.count).toBe(1);
    const filteredPlain = await list(plain, "performer", { ids, ...above1 });
    expect(filteredPlain.count).toBe(2);
  });

  it("a user with no exclusion rows gets no rows and the live numbers, on each instance", async () => {
    expect(await countRows(plainId)).toEqual(new Map());
    expect(await card(plain, "performer", `1:${A}`)).toMatchObject({
      scene_count: 3,
      image_count: 3,
      gallery_count: 1,
      group_count: 2,
    });
    expect(await card(plain, "performer", `1:${B}`)).toMatchObject({
      scene_count: 1,
    });
    expect(await card(plain, "tag", `1:${A}`)).toMatchObject({
      scene_count: 3,
      performer_count: 2,
    });
    const pairs = await cardsAndTabs(plain);
    expect(pairs.filter(([, shown, listed]) => shown !== listed)).toEqual([]);
  }, 60_000);

  it("a hide increments the co-performers', the studio's, the tags' and the collection's excluded counts inside the hide's unit, and an unhide's recompute removes them", async () => {
    const recorder = await recordCompute();
    try {
      await userHiddenEntityService.hideEntity(plainId, "scene", "1", A);
    } finally {
      recorder.restore();
    }

    const sqls = recorder.sqls();
    const begin = sqls.lastIndexOf("BEGIN IMMEDIATE");
    const unit = sqls.slice(begin, sqls.indexOf("COMMIT", begin) + 1);
    expect(unit[unit.length - 1]).toBe("COMMIT");
    const increments = unit.filter((sql) =>
      /^INSERT INTO UserExcludedContentCount /.test(sql)
    );
    expect(increments).toHaveLength(1);
    expect(increments[0]).toMatch(/DO UPDATE SET scenes = scenes \+ excluded/);

    const rows = await countRows(plainId);
    expect(rows).toEqual(
      new Map([
        [`performer:1:${A}`, { ...zero, scenes: 1 }],
        [`performer:2:${A}`, { ...zero, scenes: 1 }],
        [`studio:1:${A}`, { ...zero, scenes: 1 }],
        [`tag:1:${A}`, { ...zero, scenes: 1 }],
        [`group:1:${A}`, { ...zero, scenes: 1 }],
      ])
    );
    expect(await card(plain, "performer", `1:${A}`)).toMatchObject({
      scene_count: 2,
    });
    expect(await tab(plain, "performer", `1:${A}`, "scene")).toBe(2);

    await userHiddenEntityService.unhideEntity(plainId, "scene", "1", A);
    expect(await countRows(plainId)).toEqual(new Map());
    expect(await card(plain, "performer", `1:${A}`)).toMatchObject({
      scene_count: 3,
    });
  }, 60_000);

  it("a card never shows a negative count when the column lags", async () => {
    const key = { id_stashInstanceId: { id: "1", stashInstanceId: A } };
    // Performer 1's 2 excluded scenes against a column a sync has not
    // rebuilt yet
    await prisma.stashPerformer.update({
      where: key,
      data: { sceneCount: 1 },
    });
    try {
      expect(await card(restricted, "performer", `1:${A}`)).toMatchObject({
        scene_count: 0,
      });
      const { items } = await list(restricted, "performer", {
        ids: [`1:${A}`],
        scene_count: { value: 0, modifier: "LESS_THAN" },
      });
      expect(items).toEqual([]);
    } finally {
      await prisma.stashPerformer.update({
        where: key,
        data: { sceneCount: 3 },
      });
    }
  });
});
