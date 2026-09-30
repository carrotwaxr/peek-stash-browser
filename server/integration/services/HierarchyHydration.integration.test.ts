/**
 * Tag and studio hierarchies on list rows and detail pages, against the real
 * test SQLite database (item 34b, invariant 3; CLAUDE.md, per-user fields):
 * a tag's parents and children, a studio's parent and children, are the live
 * ones on the row's own instance that the viewer may see, and a detail page
 * answers the viewer's rating, favorite, O count and plays, never Stash's.
 *
 * The handlers run in this process for one USER on two made-up instances
 * that reuse the same ids, as two Stash servers do:
 * - tags: parent P on both; child C on both (C on hy-a also lists a hidden
 *   and a deleted parent); on hy-a a child the viewer hid and a deleted one
 * - studios: parent S on both; child C on both; on hy-a a child the viewer
 *   hid, a deleted one, and two studios under the hidden and the deleted one
 * - a performer and a collection on hy-a tagged P, whose id hy-b's P shares
 *   under another name (the detail tags, A9)
 * P on hy-a carries Stash's favorite (the studio also Stash's rating 90);
 * the viewer's own rating, favorite and stats differ. Every seeded row is
 * deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findGroups } from "../../controllers/library/groups.js";
import { findPerformers } from "../../controllers/library/performers.js";
import { findStudios } from "../../controllers/library/studios.js";
import { findTags } from "../../controllers/library/tags.js";
import type { RequestUser } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import {
  reqFor,
  resFor,
  testUser,
} from "../../tests/helpers/controllerTestUtils.js";
import { must } from "../../tests/helpers/must.js";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "hy-a";
const B = "hy-b";
const USERNAME = "hy-viewer";

// Tags
const T_PARENT = "7930011"; // on A (Stash favorite) and B
const T_CHILD = "7930012"; // on A and B, under T_PARENT
const T_HIDDEN_CHILD = "7930013"; // on A under T_PARENT, hidden by the viewer
const T_DELETED_CHILD = "7930014"; // on A under T_PARENT, deleted
const T_HIDDEN_PARENT = "7930015"; // on A, hidden; a parent of T_CHILD on A
const T_DELETED_PARENT = "7930016"; // on A, deleted; a parent of T_CHILD on A
// Studios
const S_PARENT = "7930021"; // on A (Stash favorite, rating 90) and B
const S_CHILD = "7930022"; // on A and B, under S_PARENT
const S_HIDDEN_CHILD = "7930023"; // on A under S_PARENT, hidden by the viewer
const S_DELETED_CHILD = "7930024"; // on A under S_PARENT, deleted
const S_UNDER_HIDDEN = "7930025"; // on A under S_HIDDEN_CHILD
const S_UNDER_DELETED = "7930026"; // on A under S_DELETED_CHILD
// Tagged T_PARENT on A
const PERFORMER = "7930031";
const GROUP = "7930041";

const deleted = new Date("2026-01-01T00:00:00Z");
const nameOf = (id: string, instanceId: string) => `${id} on ${instanceId}`;

let viewer: RequestUser = testUser();

/** Names of refs, in order */
const names = (refs: ReadonlyArray<{ name?: string }> | undefined) =>
  (refs ?? []).map((ref) => ref.name);

/** The handlers' body for one entity on one instance, as a detail page asks */
const detailBody = (filterKey: string, id: string, instanceId: string) => ({
  ids: [id],
  [filterKey]: { instance_id: instanceId },
});

/** The tags one request answers */
async function tagsFor(body: object) {
  const res = resFor(findTags);
  await findTags(
    reqFor(findTags, {
      body,
      user: viewer,
      allowedInstanceIds: await getUserAllowedInstanceIds(viewer.id),
    }),
    res
  );
  expect(res._getStatus()).toBe(200);
  return res._getOkBody().findTags.tags;
}

/** The studios one request answers */
async function studiosFor(body: object) {
  const res = resFor(findStudios);
  await findStudios(
    reqFor(findStudios, {
      body,
      user: viewer,
      allowedInstanceIds: await getUserAllowedInstanceIds(viewer.id),
    }),
    res
  );
  expect(res._getStatus()).toBe(200);
  return res._getOkBody().findStudios.studios;
}

/** One tag as the Tags list shows it (both instances' rows asked for) */
async function listedTag(id: string, instanceId: string) {
  const tags = await tagsFor({ ids: [`${id}:${A}`, `${id}:${B}`] });
  return must(
    tags.find((t) => t.id === id && t.instanceId === instanceId),
    `tag ${id} on ${instanceId} in the list`
  );
}

/** One tag as its detail page asks for it */
async function detailTag(id: string, instanceId: string) {
  const tags = await tagsFor(detailBody("tag_filter", id, instanceId));
  expect(tags).toHaveLength(1);
  return must(tags[0], `tag ${id} on ${instanceId}`);
}

async function listedStudio(id: string, instanceId: string) {
  const studios = await studiosFor({ ids: [`${id}:${A}`, `${id}:${B}`] });
  return must(
    studios.find((s) => s.id === id && s.instanceId === instanceId),
    `studio ${id} on ${instanceId} in the list`
  );
}

async function detailStudio(id: string, instanceId: string) {
  const studios = await studiosFor(detailBody("studio_filter", id, instanceId));
  expect(studios).toHaveLength(1);
  return must(studios[0], `studio ${id} on ${instanceId}`);
}

async function removeRows(): Promise<void> {
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
  await prisma.userStashInstance.deleteMany({
    where: { instanceId: { in: [A, B] } },
  });
  await prisma.stashInstance.deleteMany({ where: { id: { in: [A, B] } } });
}

async function seed(): Promise<void> {
  for (const [id, priority] of [
    [A, 930],
    [B, 931],
  ] as const) {
    await prisma.stashInstance.create({
      data: {
        id,
        name: id,
        url: "http://127.0.0.1:9/graphql",
        apiKey: "fixture-key",
        enabled: true,
        priority,
        // Synced: its content shows (a first-syncing instance does not)
        firstSyncedAt: new Date(),
      },
    });
  }
  const user = await prisma.user.create({
    data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
  });
  viewer = testUser({ id: user.id, username: USERNAME, role: "USER" });

  const named = (id: string, stashInstanceId: string, extra: object = {}) => ({
    id,
    stashInstanceId,
    name: nameOf(id, stashInstanceId),
    ...extra,
  });
  const parents = (...ids: string[]) => ({ parentIds: JSON.stringify(ids) });

  // hy-a's rows first, so a lookup by bare id that keeps the last row it
  // reads names hy-b's
  await prisma.stashTag.createMany({
    data: [
      named(T_PARENT, A, { favorite: true }),
      named(T_CHILD, A, parents(T_PARENT, T_HIDDEN_PARENT, T_DELETED_PARENT)),
      named(T_HIDDEN_CHILD, A, parents(T_PARENT)),
      named(T_DELETED_CHILD, A, { ...parents(T_PARENT), deletedAt: deleted }),
      named(T_HIDDEN_PARENT, A),
      named(T_DELETED_PARENT, A, { deletedAt: deleted }),
      named(T_PARENT, B),
      named(T_CHILD, B, parents(T_PARENT)),
    ],
  });
  await prisma.stashStudio.createMany({
    data: [
      named(S_PARENT, A, { favorite: true, rating100: 90 }),
      named(S_CHILD, A, { parentId: S_PARENT }),
      named(S_HIDDEN_CHILD, A, { parentId: S_PARENT }),
      named(S_DELETED_CHILD, A, { parentId: S_PARENT, deletedAt: deleted }),
      named(S_UNDER_HIDDEN, A, { parentId: S_HIDDEN_CHILD }),
      named(S_UNDER_DELETED, A, { parentId: S_DELETED_CHILD }),
      named(S_PARENT, B),
      named(S_CHILD, B, { parentId: S_PARENT }),
    ],
  });
  await prisma.stashPerformer.create({ data: named(PERFORMER, A) });
  await prisma.stashGroup.create({ data: named(GROUP, A) });
  await prisma.performerTag.create({
    data: {
      performerId: PERFORMER,
      performerInstanceId: A,
      tagId: T_PARENT,
      tagInstanceId: A,
    },
  });
  await prisma.groupTag.create({
    data: {
      groupId: GROUP,
      groupInstanceId: A,
      tagId: T_PARENT,
      tagInstanceId: A,
    },
  });

  // The viewer's own data on P and S (hy-a), unlike Stash's
  const own = { userId: user.id, instanceId: A };
  await prisma.tagRating.create({
    data: { ...own, tagId: T_PARENT, rating: 30, favorite: false },
  });
  await prisma.userTagStats.create({
    data: { ...own, tagId: T_PARENT, oCounter: 5, playCount: 6 },
  });
  await prisma.studioRating.create({
    data: { ...own, studioId: S_PARENT, rating: 20, favorite: false },
  });
  await prisma.userStudioStats.create({
    data: { ...own, studioId: S_PARENT, oCounter: 3, playCount: 4 },
  });

  // The viewer's hides, as the compute writes their exclusion rows
  await prisma.userExcludedEntity.createMany({
    data: [
      ["tag", T_HIDDEN_CHILD],
      ["tag", T_HIDDEN_PARENT],
      ["studio", S_HIDDEN_CHILD],
    ].map(([entityType, entityId]) => ({
      userId: user.id,
      entityType: must(entityType),
      entityId: must(entityId),
      instanceId: A,
      reason: "hidden",
    })),
  });
}

describeWithDb(
  "Tag and studio hierarchies per instance, with exclusions (integration)",
  () => {
    beforeAll(async () => {
      await removeRows();
      await seed();
    });

    afterAll(async () => {
      await removeRows();
    });

    describe("tags", () => {
      it("tag P on hy-b lists child C on hy-b only, on the Tags list and its detail page", async () => {
        for (const tag of [
          await listedTag(T_PARENT, B),
          await detailTag(T_PARENT, B),
        ]) {
          expect(names(tag.children)).toEqual([nameOf(T_CHILD, B)]);
          expect(tag.children).toEqual([
            expect.objectContaining({ id: T_CHILD, instanceId: B }),
          ]);
        }
      });

      it("a child hidden by the user, or deleted, is not listed", async () => {
        for (const tag of [
          await listedTag(T_PARENT, A),
          await detailTag(T_PARENT, A),
        ]) {
          expect(names(tag.children)).toEqual([nameOf(T_CHILD, A)]);
        }
      });

      it("a tag whose parent the viewer excluded, or Stash deleted, lists no such parent", async () => {
        for (const tag of [
          await listedTag(T_CHILD, A),
          await detailTag(T_CHILD, A),
        ]) {
          expect(tag.parents).toEqual([
            expect.objectContaining({
              id: T_PARENT,
              instanceId: A,
              name: nameOf(T_PARENT, A),
            }),
          ]);
        }
        // hy-b's child names hy-b's parent
        expect((await detailTag(T_CHILD, B)).parents).toEqual([
          expect.objectContaining({
            id: T_PARENT,
            instanceId: B,
            name: nameOf(T_PARENT, B),
          }),
        ]);
      });

      it("the tag detail answers the viewer's favorite, rating, O count and plays", async () => {
        expect(await detailTag(T_PARENT, A)).toMatchObject({
          favorite: false,
          rating: 30,
          rating100: 30,
          o_counter: 5,
          play_count: 6,
        });
      });
    });

    describe("studios", () => {
      it("studio S on hy-b lists child C on hy-b only, and C names its parent on hy-b", async () => {
        for (const studio of [
          await listedStudio(S_PARENT, B),
          await detailStudio(S_PARENT, B),
        ]) {
          expect(names(studio.child_studios)).toEqual([nameOf(S_CHILD, B)]);
          expect(studio.child_studios).toEqual([
            expect.objectContaining({ id: S_CHILD, instanceId: B }),
          ]);
        }
        for (const child of [
          await listedStudio(S_CHILD, B),
          await detailStudio(S_CHILD, B),
        ]) {
          expect(child.parent_studio).toMatchObject({
            id: S_PARENT,
            instanceId: B,
            name: nameOf(S_PARENT, B),
          });
        }
      });

      it("a child hidden by the user, or deleted, is not listed", async () => {
        for (const studio of [
          await listedStudio(S_PARENT, A),
          await detailStudio(S_PARENT, A),
        ]) {
          expect(names(studio.child_studios)).toEqual([nameOf(S_CHILD, A)]);
        }
      });

      it("a studio whose parent the viewer excluded, or Stash deleted, names no parent", async () => {
        for (const id of [S_UNDER_HIDDEN, S_UNDER_DELETED]) {
          expect((await listedStudio(id, A)).parent_studio).toBeNull();
          expect((await detailStudio(id, A)).parent_studio).toBeNull();
        }
      });

      it("the studio detail answers the viewer's favorite, rating, O count and plays", async () => {
        expect(await detailStudio(S_PARENT, A)).toMatchObject({
          favorite: false,
          rating: 20,
          rating100: 20,
          o_counter: 3,
          play_count: 4,
        });
      });
    });

    describe("detail tags", () => {
      it("a performer's detail tags keep the builder's names when hy-b has the same tag id with another name", async () => {
        const res = resFor(findPerformers);
        await findPerformers(
          reqFor(findPerformers, {
            body: detailBody("performer_filter", PERFORMER, A),
            user: viewer,
            allowedInstanceIds: await getUserAllowedInstanceIds(viewer.id),
          }),
          res
        );
        const performer = must(res._getOkBody().findPerformers.performers[0]);
        expect(performer.tags).toEqual([
          expect.objectContaining({
            id: T_PARENT,
            instanceId: A,
            name: nameOf(T_PARENT, A),
          }),
        ]);
      });

      it("a collection's detail tags keep the builder's names when hy-b has the same tag id with another name", async () => {
        const res = resFor(findGroups);
        await findGroups(
          reqFor(findGroups, {
            body: detailBody("group_filter", GROUP, A),
            user: viewer,
            allowedInstanceIds: await getUserAllowedInstanceIds(viewer.id),
          }),
          res
        );
        const group = must(res._getOkBody().findGroups.groups[0]);
        expect(group.tags).toEqual([
          expect.objectContaining({
            id: T_PARENT,
            instanceId: A,
            name: nameOf(T_PARENT, A),
          }),
        ]);
      });
    });
  }
);
