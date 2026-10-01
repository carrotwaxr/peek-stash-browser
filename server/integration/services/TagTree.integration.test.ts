/**
 * The compact tag tree (item 41.8), against the real test SQLite database.
 *
 * `POST /api/library/tags/tree` answers every tag the user can see, with its
 * parents, counts, the user's own rating, favorite and O count, and its
 * instance: no tooltip relations. The Tags page's hierarchy view and the
 * folder view build their trees from it; children are derived on the client.
 * A parent the user cannot see is left out of a tag's parents, so the tag
 * becomes a root.
 *
 * With a scope (a performer, tag, studio, collection or gallery, as
 * "id:instanceId" or a bare id for every instance), only the tags on the scope's visible scenes
 * and their ancestors: the walk up `parentIds` applies the exclusion join,
 * `deletedAt` and the allowed instances at every step, so it stops at a
 * hidden or restricted ancestor, and the child it would have led to becomes a
 * root. A scoped row's scene_count counts the scope's visible scenes that
 * carry the tag; its other counts are 0.
 *
 * Made-up instances that real sync never touches, reusing the same ids as
 * two Stash servers do:
 * - A: ROOT > CHILD > GRAND; OTHER; MULTI under ROOT and OTHER; ABOVE_HIDDEN >
 *   HIDDEN > UNDER_HIDDEN; ABOVE_RESTRICTED > RESTRICTED > UNDER_RESTRICTED;
 *   HALF under ROOT and HIDDEN; DELETED (soft-deleted); ON_HIDDEN_SCENE and
 *   ON_DELETED_SCENE, found only on those scenes
 * - B: ROOT > CHILD, named "B ..."
 * - OFF (disabled): ROOT
 * - scenes on A: SCENE (performer P, studio ST, collection G; GRAND,
 *   UNDER_HIDDEN, UNDER_RESTRICTED), SCENE2 (P; GRAND), MULTI_SCENE (MULTI),
 *   HIDDEN_SCENE (P; ON_HIDDEN_SCENE), DELETED_SCENE (P; ON_DELETED_SCENE),
 *   UNTAGGED_SCENE (P and Q; no tag), INHERITING_SCENE (Q; no tag of its own,
 *   GRAND inherited)
 * - SCENE on B (P, ST and G on B; CHILD) and on OFF (P on OFF; ROOT)
 *
 * The user hides HIDDEN and HIDDEN_SCENE, and RESTRICTED is restricted for
 * them. Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { loadTagTree } from "../../services/TagTreeService.js";
import { must } from "../../tests/helpers/must.js";
import type { FindTagTreeResponse } from "../../types/api/index.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import { recordStatements } from "../helpers/statementRecorder.js";
import { type TestClient, adminClient } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "tagtree-it-a";
const B = "tagtree-it-b";
const OFF = "tagtree-it-off";
const INSTANCES = [A, B, OFF];
const USERNAME = "tagtree_it_user";

const T = {
  ROOT: "7740001",
  CHILD: "7740002",
  GRAND: "7740003",
  OTHER: "7740004",
  MULTI: "7740005",
  HIDDEN: "7740006",
  ABOVE_HIDDEN: "7740007",
  UNDER_HIDDEN: "7740008",
  ABOVE_RESTRICTED: "7740009",
  RESTRICTED: "7740010",
  UNDER_RESTRICTED: "7740011",
  HALF: "7740012",
  DELETED: "7740013",
  ON_DELETED_SCENE: "7740014",
  ON_HIDDEN_SCENE: "7740015",
} as const;

const S = {
  SCENE: "7740101",
  SCENE2: "7740102",
  HIDDEN_SCENE: "7740103",
  DELETED_SCENE: "7740104",
  MULTI_SCENE: "7740105",
  UNTAGGED_SCENE: "7740106",
  INHERITING_SCENE: "7740107",
} as const;

const P = "7740201";
/** Performer of UNTAGGED_SCENE and INHERITING_SCENE only */
const Q = "7740202";
const ST = "7740301";
const G = "7740401";
const GA = "7740501";

const key = (id: string, instanceId: string) => `${id}:${instanceId}`;

type TreeRow = FindTagTreeResponse["tags"][number];

async function clearFixture(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { username: USERNAME },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  // UserTagStats has no relation to User, so it does not cascade
  await prisma.userTagStats.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  const where = { stashInstanceId: { in: INSTANCES } };
  // Junction rows cascade with their scene
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.stashGallery.deleteMany({ where });
  await prisma.userStashInstance.deleteMany({
    where: { instanceId: { in: INSTANCES } },
  });
  await prisma.stashInstance.deleteMany({ where: { id: { in: INSTANCES } } });
}

async function seedFixture(): Promise<void> {
  await clearFixture();

  const instances = [
    { id: A, enabled: true, priority: 910 },
    { id: B, enabled: true, priority: 911 },
    { id: OFF, enabled: false, priority: 912 },
  ];
  for (const inst of instances) {
    await prisma.stashInstance.create({
      data: {
        ...inst,
        name: inst.id,
        url: "http://127.0.0.1:9/graphql",
        apiKey: "fixture-key",
        // Synced: its content shows (a first-syncing instance does not)
        firstSyncedAt: new Date(),
      },
    });
  }

  const tag = (
    id: string,
    stashInstanceId: string,
    name: string,
    parents: string[] = [],
    extra: { deletedAt?: Date } = {}
  ) => ({
    id,
    stashInstanceId,
    name,
    parentIds: JSON.stringify(parents),
    ...extra,
  });
  await prisma.stashTag.createMany({
    data: [
      {
        ...tag(T.ROOT, A, "Root"),
        sceneCount: 10,
        sceneCountAll: 12,
        imageCount: 3,
        galleryCount: 2,
        performerCount: 4,
        imagePath: "http://127.0.0.1:9/tag/7740001/image",
        stashCreatedAt: new Date("2024-01-02T03:04:05.000Z"),
        stashUpdatedAt: new Date("2024-02-03T04:05:06.000Z"),
      },
      tag(T.CHILD, A, "Child", [T.ROOT]),
      { ...tag(T.GRAND, A, "Grand", [T.CHILD]), sceneCountAll: 2 },
      tag(T.OTHER, A, "Other"),
      tag(T.MULTI, A, "Multi", [T.ROOT, T.OTHER]),
      tag(T.ABOVE_HIDDEN, A, "Above Hidden"),
      tag(T.HIDDEN, A, "Hidden", [T.ABOVE_HIDDEN]),
      tag(T.UNDER_HIDDEN, A, "Under Hidden", [T.HIDDEN]),
      tag(T.ABOVE_RESTRICTED, A, "Above Restricted"),
      tag(T.RESTRICTED, A, "Restricted", [T.ABOVE_RESTRICTED]),
      tag(T.UNDER_RESTRICTED, A, "Under Restricted", [T.RESTRICTED]),
      tag(T.HALF, A, "Half", [T.ROOT, T.HIDDEN]),
      tag(T.DELETED, A, "Deleted", [], { deletedAt: new Date() }),
      tag(T.ON_DELETED_SCENE, A, "On Deleted Scene"),
      tag(T.ON_HIDDEN_SCENE, A, "On Hidden Scene"),
      tag(T.ROOT, B, "B Root"),
      tag(T.CHILD, B, "B Child", [T.ROOT]),
      tag(T.ROOT, OFF, "Off Root"),
    ],
  });

  const named = (id: string, stashInstanceId: string) => ({
    id,
    stashInstanceId,
    name: `${stashInstanceId}-${id}`,
  });
  await prisma.stashPerformer.createMany({
    data: [...INSTANCES.map((inst) => named(P, inst)), named(Q, A)],
  });
  await prisma.stashStudio.createMany({
    data: [A, B].map((inst) => named(ST, inst)),
  });
  await prisma.stashGroup.createMany({
    data: [A, B].map((inst) => named(G, inst)),
  });
  await prisma.stashGallery.createMany({
    data: [A, B].map((inst) => ({
      id: GA,
      stashInstanceId: inst,
      title: `${inst}-${GA}`,
    })),
  });

  await prisma.stashScene.createMany({
    data: [
      { id: S.SCENE, stashInstanceId: A, studioId: ST },
      { id: S.SCENE2, stashInstanceId: A },
      { id: S.MULTI_SCENE, stashInstanceId: A },
      { id: S.UNTAGGED_SCENE, stashInstanceId: A },
      { id: S.INHERITING_SCENE, stashInstanceId: A },
      { id: S.HIDDEN_SCENE, stashInstanceId: A },
      { id: S.DELETED_SCENE, stashInstanceId: A, deletedAt: new Date() },
      { id: S.SCENE, stashInstanceId: B, studioId: ST },
      { id: S.SCENE, stashInstanceId: OFF },
    ],
  });

  const sceneTag = (sceneId: string, inst: string, tagId: string) => ({
    sceneId,
    sceneInstanceId: inst,
    tagId,
    tagInstanceId: inst,
  });
  await prisma.sceneTag.createMany({
    data: [
      sceneTag(S.SCENE, A, T.GRAND),
      sceneTag(S.SCENE, A, T.UNDER_HIDDEN),
      sceneTag(S.SCENE, A, T.UNDER_RESTRICTED),
      sceneTag(S.SCENE2, A, T.GRAND),
      sceneTag(S.MULTI_SCENE, A, T.MULTI),
      sceneTag(S.HIDDEN_SCENE, A, T.ON_HIDDEN_SCENE),
      sceneTag(S.DELETED_SCENE, A, T.ON_DELETED_SCENE),
      sceneTag(S.SCENE, B, T.CHILD),
      sceneTag(S.SCENE, OFF, T.ROOT),
    ],
  });
  // A tag the scene inherits (from a performer or studio), as sync stores it
  await prisma.sceneInheritedTag.create({
    data: {
      sceneId: S.INHERITING_SCENE,
      sceneInstanceId: A,
      tagId: T.GRAND,
      tagInstanceId: A,
    },
  });
  // Each scene's stored count of its tags, as sync writes it
  await prisma.$executeRawUnsafe(
    `UPDATE StashScene SET tagCount = (SELECT COUNT(*) FROM SceneTag st WHERE st.sceneId = StashScene.id AND st.sceneInstanceId = StashScene.stashInstanceId)
     WHERE stashInstanceId IN (?, ?, ?)`,
    ...INSTANCES
  );

  const scenePerformer = (sceneId: string, inst: string) => ({
    sceneId,
    sceneInstanceId: inst,
    performerId: P,
    performerInstanceId: inst,
  });
  await prisma.scenePerformer.createMany({
    data: [
      scenePerformer(S.SCENE, A),
      scenePerformer(S.SCENE2, A),
      scenePerformer(S.UNTAGGED_SCENE, A),
      { ...scenePerformer(S.UNTAGGED_SCENE, A), performerId: Q },
      { ...scenePerformer(S.INHERITING_SCENE, A), performerId: Q },
      scenePerformer(S.HIDDEN_SCENE, A),
      scenePerformer(S.DELETED_SCENE, A),
      scenePerformer(S.SCENE, B),
      scenePerformer(S.SCENE, OFF),
    ],
  });
  await prisma.sceneGroup.createMany({
    data: [A, B].map((inst) => ({
      sceneId: S.SCENE,
      sceneInstanceId: inst,
      groupId: G,
      groupInstanceId: inst,
    })),
  });
  await prisma.sceneGallery.createMany({
    data: [A, B].map((inst) => ({
      sceneId: S.SCENE,
      sceneInstanceId: inst,
      galleryId: GA,
      galleryInstanceId: inst,
    })),
  });
}

/** The user's hides and restriction, as the exclusion compute stores them */
async function excludeFor(userId: number): Promise<void> {
  const rows = [
    { entityType: "tag", entityId: T.HIDDEN, reason: "hidden" },
    { entityType: "scene", entityId: S.HIDDEN_SCENE, reason: "hidden" },
    { entityType: "tag", entityId: T.RESTRICTED, reason: "restricted" },
  ];
  for (const row of rows) {
    if (row.reason === "hidden") {
      await prisma.userHiddenEntity.create({
        data: {
          userId,
          entityType: row.entityType,
          entityId: row.entityId,
          instanceId: A,
        },
      });
    }
    await prisma.userExcludedEntity.create({
      data: { userId, ...row, instanceId: A },
    });
  }
  await prisma.tagRating.create({
    data: { userId, instanceId: A, tagId: T.GRAND, rating: 80, favorite: true },
  });
  await prisma.userTagStats.create({
    data: { userId, instanceId: A, tagId: T.GRAND, oCounter: 3, playCount: 1 },
  });
}

/** The rows on the fixture's instances, by "id:instance" */
function fixtureRows(rows: readonly TreeRow[]): Map<string, TreeRow> {
  return new Map(
    rows
      .filter((r) => INSTANCES.includes(r.instanceId))
      .map((r) => [key(r.id, r.instanceId), r])
  );
}

const parentIds = (row: TreeRow | undefined) =>
  must(row, "the row")
    .parents.map((p) => p.id)
    .sort();

describeWithDb("Tag tree (integration)", () => {
  let user: { id: number; client: TestClient };

  async function tree(
    body: object = {}
  ): Promise<{ status: number; rows: Map<string, TreeRow> }> {
    const res = await user.client.post<FindTagTreeResponse>(
      "/api/library/tags/tree",
      body
    );
    return {
      status: res.status,
      rows: res.ok ? fixtureRows(res.data.tags) : new Map<string, TreeRow>(),
    };
  }

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedFixture();
    user = await createApiUser(USERNAME, "tagtree_it_pass_1");
    await excludeFor(user.id);
  }, 60000);

  afterAll(async () => {
    await clearFixture();
  }, 60000);

  it("returns every visible tag with parents, counts and instanceId, no tooltip relations", async () => {
    const { status, rows } = await tree();
    expect(status).toBe(200);

    expect([...rows.keys()].sort()).toEqual(
      [
        key(T.ROOT, A),
        key(T.CHILD, A),
        key(T.GRAND, A),
        key(T.OTHER, A),
        key(T.MULTI, A),
        key(T.ABOVE_HIDDEN, A),
        key(T.UNDER_HIDDEN, A),
        key(T.ABOVE_RESTRICTED, A),
        key(T.UNDER_RESTRICTED, A),
        key(T.HALF, A),
        key(T.ON_DELETED_SCENE, A),
        key(T.ON_HIDDEN_SCENE, A),
        key(T.ROOT, B),
        key(T.CHILD, B),
      ].sort()
    );

    const root = must(rows.get(key(T.ROOT, A)), "ROOT on A");
    expect(Object.keys(root).sort()).toEqual([
      "created_at",
      "favorite",
      "gallery_count",
      "id",
      "image_count",
      "image_path",
      "instanceId",
      "name",
      "o_counter",
      "parents",
      "performer_count",
      "rating100",
      "scene_count",
      "updated_at",
    ]);
    expect(root).toEqual({
      id: T.ROOT,
      instanceId: A,
      name: "Root",
      image_path: `/api/proxy/stash?path=${encodeURIComponent("/tag/7740001/image")}&instanceId=${A}`,
      parents: [],
      // The card's count: its scenes tagged directly or inheriting it, as
      // the list, minus the ones the user cannot see (none here)
      scene_count: 12,
      image_count: 3,
      gallery_count: 2,
      performer_count: 4,
      created_at: "2024-01-02T03:04:05.000Z",
      updated_at: "2024-02-03T04:05:06.000Z",
      rating100: null,
      favorite: false,
      o_counter: 0,
    });

    // The user's own rating, favorite and O count, on A only
    expect(rows.get(key(T.GRAND, A))).toMatchObject({
      parents: [{ id: T.CHILD }],
      scene_count: 2,
      rating100: 80,
      favorite: true,
      o_counter: 3,
    });
    expect(rows.get(key(T.CHILD, B))).toMatchObject({
      name: "B Child",
      parents: [{ id: T.ROOT }],
      rating100: null,
      favorite: false,
      o_counter: 0,
    });
    expect(parentIds(rows.get(key(T.MULTI, A)))).toEqual([T.ROOT, T.OTHER]);
  });

  it("a hidden tag and its now-parentless children are handled: the child becomes a root", async () => {
    const { rows } = await tree();

    expect(rows.has(key(T.HIDDEN, A))).toBe(false);
    expect(parentIds(rows.get(key(T.UNDER_HIDDEN, A)))).toEqual([]);
    // A second, visible parent stays
    expect(parentIds(rows.get(key(T.HALF, A)))).toEqual([T.ROOT]);
    // The hidden tag's own parent is still a tag the user sees
    expect(parentIds(rows.get(key(T.ABOVE_HIDDEN, A)))).toEqual([]);

    expect(rows.has(key(T.RESTRICTED, A))).toBe(false);
    expect(parentIds(rows.get(key(T.UNDER_RESTRICTED, A)))).toEqual([]);
  });

  it("a scope of performer P on A returns the tags on P's visible scenes and their ancestors, never B's", async () => {
    const { status, rows } = await tree({ scope: { performer: key(P, A) } });
    expect(status).toBe(200);

    expect([...rows.keys()].sort()).toEqual(
      [
        key(T.GRAND, A),
        key(T.CHILD, A),
        key(T.ROOT, A),
        key(T.UNDER_HIDDEN, A),
        key(T.UNDER_RESTRICTED, A),
      ].sort()
    );
    // Counts within the scope: P's visible scenes carrying the tag
    expect(rows.get(key(T.GRAND, A))).toMatchObject({
      parents: [{ id: T.CHILD }],
      scene_count: 2,
      image_count: 0,
      gallery_count: 0,
      performer_count: 0,
      rating100: 80,
    });
    expect(rows.get(key(T.CHILD, A))).toMatchObject({
      parents: [{ id: T.ROOT }],
      scene_count: 0,
    });
    expect(rows.get(key(T.ROOT, A))).toMatchObject({
      parents: [],
      scene_count: 0,
    });
  });

  it("an ancestor hidden by the user does not appear in a scoped tree; the child it would have led to becomes a root", async () => {
    const { rows } = await tree({ scope: { performer: key(P, A) } });

    expect(rows.has(key(T.HIDDEN, A))).toBe(false);
    // The walk stops at the hidden tag: its own parent is not reached
    expect(rows.has(key(T.ABOVE_HIDDEN, A))).toBe(false);
    expect(parentIds(rows.get(key(T.UNDER_HIDDEN, A)))).toEqual([]);
  });

  it("an ancestor restricted for the user does not appear in a scoped tree; the child it would have led to becomes a root", async () => {
    const { rows } = await tree({ scope: { performer: key(P, A) } });

    expect(rows.has(key(T.RESTRICTED, A))).toBe(false);
    expect(rows.has(key(T.ABOVE_RESTRICTED, A))).toBe(false);
    expect(parentIds(rows.get(key(T.UNDER_RESTRICTED, A)))).toEqual([]);
  });

  it("a bare performer id scopes to that id on every allowed instance, never a disabled one", async () => {
    const { rows } = await tree({ scope: { performer: P } });

    expect([...rows.keys()].sort()).toEqual(
      [
        key(T.GRAND, A),
        key(T.CHILD, A),
        key(T.ROOT, A),
        key(T.UNDER_HIDDEN, A),
        key(T.UNDER_RESTRICTED, A),
        key(T.CHILD, B),
        key(T.ROOT, B),
      ].sort()
    );
    expect(rows.get(key(T.CHILD, B))).toMatchObject({ scene_count: 1 });
  });

  it("a studio, collection, gallery or tag scope matches its scenes on its own instance", async () => {
    const onScene = [
      key(T.GRAND, A),
      key(T.CHILD, A),
      key(T.ROOT, A),
      key(T.UNDER_HIDDEN, A),
      key(T.UNDER_RESTRICTED, A),
    ].sort();

    const studio = await tree({ scope: { studio: key(ST, A) } });
    expect([...studio.rows.keys()].sort()).toEqual(onScene);
    expect(studio.rows.get(key(T.GRAND, A))).toMatchObject({ scene_count: 1 });

    const group = await tree({ scope: { group: key(G, A) } });
    expect([...group.rows.keys()].sort()).toEqual(onScene);

    const gallery = await tree({ scope: { gallery: key(GA, A) } });
    expect([...gallery.rows.keys()].sort()).toEqual(onScene);
    const galleryOnB = await tree({ scope: { gallery: key(GA, B) } });
    expect([...galleryOnB.rows.keys()].sort()).toEqual(
      [key(T.CHILD, B), key(T.ROOT, B)].sort()
    );

    const onB = await tree({ scope: { studio: key(ST, B) } });
    expect([...onB.rows.keys()].sort()).toEqual(
      [key(T.CHILD, B), key(T.ROOT, B)].sort()
    );

    // Scenes with GRAND: SCENE and SCENE2 directly, INHERITING_SCENE by
    // inheritance
    const byTag = await tree({ scope: { tag: key(T.GRAND, A) } });
    expect([...byTag.rows.keys()].sort()).toEqual(onScene);
    expect(byTag.rows.get(key(T.GRAND, A))).toMatchObject({ scene_count: 3 });
  });

  it("scope parts combine: performer P and studio ST on A leave only SCENE", async () => {
    const { rows } = await tree({
      scope: { performer: key(P, A), studio: key(ST, A) },
    });
    expect(rows.get(key(T.GRAND, A))).toMatchObject({ scene_count: 1 });
    expect(rows.has(key(T.CHILD, B))).toBe(false);
  });

  it("a scope ref that is not an id, or an unknown key, answers 400", async () => {
    const badRef = await user.client.post("/api/library/tags/tree", {
      scope: { performer: "abc" },
    });
    expect(badRef.status).toBe(400);

    const unknown = await user.client.post("/api/library/tags/tree", {
      scope: { scene: key(S.SCENE, A) },
    });
    expect(unknown.status).toBe(400);
  });

  describe("untagged counts", () => {
    const LISTS = {
      scene: ["/api/library/scenes", "scene_filter", "findScenes", "scenes"],
      gallery: [
        "/api/library/galleries",
        "gallery_filter",
        "findGalleries",
        "galleries",
      ],
      image: ["/api/library/images", "image_filter", "findImages", "images"],
    } as const;
    type Kind = keyof typeof LISTS;
    const KINDS = Object.keys(LISTS) as Kind[];

    /**
     * The folder view's Untagged list: scenes with no tag, their own or
     * inherited (`tagged: false`); galleries and images with no tag rows
     * (`tag_count` EQUALS 0)
     */
    const UNTAGGED_FILTER = {
      scene: { tagged: false },
      gallery: { tag_count: { value: 0, modifier: "EQUALS" } },
      image: { tag_count: { value: 0, modifier: "EQUALS" } },
    } as const;

    /** A list's page of 250 and its total */
    async function list(
      kind: Kind,
      filter: Record<string, unknown>
    ): Promise<{ status: number; count: number; ids: string[] }> {
      const [path, filterKey, resultKey, rowsKey] = LISTS[kind];
      const res = await user.client.post<
        Record<
          string,
          | ({ count: number } & Record<string, { id: string }[] | number>)
          | undefined
        >
      >(path, { filter: { page: 1, per_page: 250 }, [filterKey]: filter });
      const answer = res.data[resultKey];
      const found = answer?.[rowsKey];
      const rows = Array.isArray(found) ? found : [];
      return {
        status: res.status,
        count: answer?.count ?? -1,
        ids: rows.map((row) => row.id),
      };
    }

    /** The total of the Untagged list */
    async function untaggedTotal(
      kind: Kind,
      filter: Record<string, unknown> = {}
    ): Promise<number> {
      const res = await list(kind, { ...filter, ...UNTAGGED_FILTER[kind] });
      expect(res.status).toBe(200);
      return res.count;
    }

    /** The tree's Untagged count of a type; none without `untagged` */
    async function untagged(kind: Kind, body: object = {}) {
      const res = await user.client.post<FindTagTreeResponse>(
        "/api/library/tags/tree",
        { ...body, untagged: kind }
      );
      expect(res.status).toBe(200);
      return must(res.data.untagged, `the untagged ${kind} count`);
    }

    async function allUntagged(): Promise<Record<Kind, number>> {
      return {
        scene: await untagged("scene"),
        gallery: await untagged("gallery"),
        image: await untagged("image"),
      };
    }

    it("each is its Untagged list's total, and an excluded item leaves both (invariant 3)", async () => {
      const plain = await user.client.post<FindTagTreeResponse>(
        "/api/library/tags/tree",
        {}
      );
      expect(plain.data.untagged).toBeUndefined();

      const before = await allUntagged();
      for (const kind of KINDS) {
        expect({ kind, count: before[kind] }).toEqual({
          kind,
          count: await untaggedTotal(kind),
        });
      }

      // An untagged scene and image of the library outside the fixture
      const [scene] = await prisma.$queryRawUnsafe<
        { id: string; stashInstanceId: string }[]
      >(
        `SELECT s.id, s.stashInstanceId FROM StashScene s WHERE s.deletedAt IS NULL AND s.tagCount = 0 AND s.stashInstanceId NOT IN (?, ?, ?)
         AND NOT EXISTS (SELECT 1 FROM SceneInheritedTag it WHERE it.sceneId = s.id AND it.sceneInstanceId = s.stashInstanceId) LIMIT 1`,
        ...INSTANCES
      );
      const [image] = await prisma.$queryRawUnsafe<
        { id: string; stashInstanceId: string }[]
      >(
        `SELECT i.id, i.stashInstanceId FROM StashImage i WHERE i.deletedAt IS NULL AND i.stashInstanceId NOT IN (?, ?, ?)
         AND NOT EXISTS (SELECT 1 FROM ImageTag it WHERE it.imageId = i.id AND it.imageInstanceId = i.stashInstanceId) LIMIT 1`,
        ...INSTANCES
      );
      const excluded = [
        { entityType: "scene", row: must(scene, "an untagged scene") },
        { entityType: "image", row: must(image, "an untagged image") },
      ];
      const rows = await Promise.all(
        excluded.map(({ entityType, row }) =>
          prisma.userExcludedEntity.create({
            data: {
              userId: user.id,
              entityType,
              entityId: row.id,
              instanceId: row.stashInstanceId,
              reason: "hidden",
            },
          })
        )
      );
      try {
        const after = await allUntagged();
        expect(after).toEqual({
          scene: before.scene - 1,
          gallery: before.gallery,
          image: before.image - 1,
        });
        expect(after.scene).toBe(await untaggedTotal("scene"));
        expect(after.image).toBe(await untaggedTotal("image"));
      } finally {
        await prisma.userExcludedEntity.deleteMany({
          where: { id: { in: rows.map((row) => row.id) } },
        });
      }
    });

    it("a scene that only inherits a tag is not Untagged but in its tag's folder; a scene with no tag is Untagged", async () => {
      const scope = { performer: key(Q, A) };
      const byQ = { performers: { value: [key(Q, A)], modifier: "INCLUDES" } };

      // Q's scenes: UNTAGGED_SCENE (no tag) and INHERITING_SCENE (GRAND,
      // inherited only)
      expect(await untagged("scene", { scope })).toBe(1);
      const untaggedList = await list("scene", {
        ...byQ,
        ...UNTAGGED_FILTER.scene,
      });
      expect(untaggedList).toEqual({
        status: 200,
        count: 1,
        ids: [S.UNTAGGED_SCENE],
      });

      // GRAND's folder on Q's page holds the inheriting scene, and its badge
      // counts it
      const { rows } = await tree({ scope });
      expect(rows.get(key(T.GRAND, A))?.scene_count).toBe(1);
      const folder = await list("scene", {
        ...byQ,
        tags: { value: [key(T.GRAND, A)], modifier: "INCLUDES", depth: 0 },
      });
      expect(folder).toEqual({
        status: 200,
        count: 1,
        ids: [S.INHERITING_SCENE],
      });

      // The contract's tag_count still counts a scene's own tags only
      const direct = await list("scene", {
        ...byQ,
        tag_count: { value: 0, modifier: "EQUALS" },
      });
      expect(direct.ids.sort()).toEqual(
        [S.UNTAGGED_SCENE, S.INHERITING_SCENE].sort()
      );
    });

    it("with a scope, the scope's scenes only: the total of its Untagged list", async () => {
      const scope = { scope: { performer: key(P, A) } };
      const scenes = await untagged("scene", scope);

      expect(scenes).toBe(
        await untaggedTotal("scene", {
          performers: { value: [key(P, A)], modifier: "INCLUDES" },
        })
      );
      // P's one untagged scene on A (its tagged, hidden and deleted ones
      // are not)
      expect(scenes).toBe(1);
      expect(await untagged("gallery", scope)).toBe(0);
      expect(await untagged("image", scope)).toBe(0);
    });
  });

  it("one statement", async () => {
    const recorder = recordStatements();
    try {
      const all = await loadTagTree({
        userId: user.id,
        allowedInstanceIds: [A, B],
      });
      expect(recorder.statements).toHaveLength(1);

      const scoped = await loadTagTree({
        userId: user.id,
        allowedInstanceIds: [A, B],
        scope: { performer: { id: P, instanceId: A } },
      });
      expect(recorder.statements).toHaveLength(2);

      expect(fixtureRows(all).size).toBe(14);
      expect([...fixtureRows(scoped).keys()]).toContain(key(T.ROOT, A));
    } finally {
      recorder.restore();
    }
  });
});
