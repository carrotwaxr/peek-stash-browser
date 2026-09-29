/**
 * The entities a list row nests, against the real test SQLite database
 * (invariant 3; CLAUDE.md, per-user fields): a scene's performers, tags,
 * inherited tags, collections, galleries and studio; a gallery's
 * performers, tags and studio; an image's performers, tags, galleries and
 * studio; a collection's studio; a clip's tags and primary tag.
 *
 * Two made-up instances and two viewers. Viewer 1 has exclusion rows as the
 * compute writes them, but no cascade to the parents (cascades are first
 * order: a performer excluded through a tag leaves that performer's scenes
 * listed): a performer excluded through a tag, a hidden performer, tag,
 * collection, gallery and image on A, a tag hidden by a legacy global row,
 * a restricted studio. Viewer 2 has none. Some related rows are soft-deleted.
 * Stash's own favorite and rating sit on the visible performer, tag and
 * studio, with no rating row of either viewer. Every seeded row is deleted
 * before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import {
  parsedClipRequest,
  parsedListRequest,
} from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type { RefCriterion } from "../../types/parsedFilters.js";
import { recordStatements } from "../helpers/statementRecorder.js";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "nr-a";
const B = "nr-b";
const USERNAMES = ["nr-viewer-1", "nr-viewer-2"];

// Performers
const P_VIS = "7920001"; // Stash favorite and rating100 90
const P_CASCADE = "7920002"; // excluded for viewer 1 through a tag; also on B
const P_HIDDEN = "7920003"; // hidden by viewer 1
const P_DEL = "7920004"; // soft-deleted
// Tags
const T_VIS = "7920011"; // Stash favorite
const T_DEL = "7920012"; // soft-deleted
const T_HID = "7920013"; // hidden by viewer 1 on A; also on B
const T_GLOBAL = "7920014"; // hidden by viewer 1 with a legacy global row
// Studios
const S_VIS = "7920021"; // Stash favorite and rating100 80
const S_HID = "7920022"; // restricted for viewer 1
const S_DEL = "7920023"; // soft-deleted
// Collections: nested in a scene, then list rows by their studio
const G_VIS = "7920031";
const G_HID = "7920032";
const G_DEL = "7920033";
const GR_STUDIO_HID = "7920034";
const GR_STUDIO_DEL = "7920035";
const GR_STUDIO_VIS = "7920036";
// Galleries: nested in a scene or an image, then list rows
const GL_VIS = "7920041";
const GL_HID = "7920042";
const GL_DEL = "7920043";
const GP_RELATIONS = "7920044"; // its own performers, tags and studio
const GP_FAV_DELETED = "7920045"; // holds a favorited image Stash deleted
const GP_FAV_VISIBLE = "7920046"; // holds a favorited image viewer 1 sees
// Scenes
const SC_RELATIONS = "7920051"; // on A and on B
const SC_STUDIO_DEL = "7920052";
const SC_FAVORITES = "7920053";
// Images
const IM_HIDDEN = "7920061"; // favorited and hidden by viewer 1, in GP_RELATIONS
const IM_DELETED = "7920062"; // favorited by viewer 1, deleted, in GP_FAV_DELETED
const IM_VISIBLE = "7920063"; // favorited by viewer 1, in GP_FAV_VISIBLE
const IM_RELATIONS = "7920064";
// Clips, on SC_FAVORITES
const CL_DELETED_PRIMARY = "7920071";
const CL_VISIBLE_PRIMARY = "7920072";
const CL_HIDDEN_PRIMARY = "7920073";

let viewer1 = 0;
let viewer2 = 0;

const deleted = new Date("2026-01-01T00:00:00Z");

/** Ids of refs, in order */
const ids = (refs: ReadonlyArray<{ id: string }> | undefined) =>
  (refs ?? []).map((ref) => ref.id);

/** The `ids` filter for these (id, instance) pairs */
const idsOf = (
  pairs: ReadonlyArray<readonly [id: string, instanceId: string]>
): RefCriterion => ({
  refs: pairs.map(([id, instanceId]) => ({ id, instanceId })),
  modifier: "INCLUDES",
  depth: 0,
});

const listOptions = (userId: number) => ({
  userId,
  allowedInstanceIds: [A, B],
  applyExclusions: true,
});

async function scene(userId: number, id: string, instanceId = A) {
  const { items } = await sceneQueryBuilder.execute({
    ...listOptions(userId),
    request: parsedListRequest("scene", {
      filter: { ids: idsOf([[id, instanceId]]) },
    }),
  });
  return must(items[0], `scene ${id} on ${instanceId}`);
}

async function gallery(userId: number, id: string) {
  const { items } = await galleryQueryBuilder.execute({
    ...listOptions(userId),
    request: parsedListRequest("gallery", {
      filter: { ids: idsOf([[id, A]]) },
    }),
  });
  return must(items[0], `gallery ${id}`);
}

async function removeRows(): Promise<void> {
  await prisma.user.deleteMany({ where: { username: { in: USERNAMES } } });
  const where = { stashInstanceId: { in: [A, B] } };
  // Clips first: a clip's primary tag is not a cascading relation
  await prisma.stashClip.deleteMany({ where });
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashImage.deleteMany({ where });
  await prisma.stashGallery.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

async function seed(): Promise<void> {
  const [u1, u2] = await Promise.all(
    USERNAMES.map((username) =>
      prisma.user.create({
        data: { username, password: "not-a-real-hash", role: "USER" },
      })
    )
  );
  viewer1 = must(u1, "viewer 1").id;
  viewer2 = must(u2, "viewer 2").id;

  const named = (
    id: string,
    extra: { deletedAt?: Date; favorite?: boolean; rating100?: number } = {},
    stashInstanceId = A
  ) => ({ id, stashInstanceId, name: `${id} on ${stashInstanceId}`, ...extra });

  await prisma.stashPerformer.createMany({
    data: [
      named(P_VIS, { favorite: true, rating100: 90 }),
      named(P_CASCADE),
      named(P_HIDDEN),
      named(P_DEL, { deletedAt: deleted }),
      named(P_CASCADE, {}, B),
    ],
  });
  await prisma.stashTag.createMany({
    data: [
      named(T_VIS, { favorite: true }),
      named(T_DEL, { deletedAt: deleted }),
      named(T_HID),
      named(T_GLOBAL),
      named(T_HID, {}, B),
    ],
  });
  await prisma.stashStudio.createMany({
    data: [
      named(S_VIS, { favorite: true, rating100: 80 }),
      named(S_HID),
      named(S_DEL, { deletedAt: deleted }),
    ],
  });
  await prisma.stashGroup.createMany({
    data: [
      named(G_VIS),
      named(G_HID),
      named(G_DEL, { deletedAt: deleted }),
      { ...named(GR_STUDIO_HID), studioId: S_HID },
      { ...named(GR_STUDIO_DEL), studioId: S_DEL },
      { ...named(GR_STUDIO_VIS), studioId: S_VIS },
    ],
  });
  const titled = (id: string, extra: object = {}) => ({
    id,
    stashInstanceId: A,
    title: `Gallery ${id}`,
    ...extra,
  });
  await prisma.stashGallery.createMany({
    data: [
      titled(GL_VIS),
      titled(GL_HID),
      titled(GL_DEL, { deletedAt: deleted }),
      titled(GP_RELATIONS, { studioId: S_HID, studioInstanceId: A }),
      titled(GP_FAV_DELETED, { studioId: S_VIS, studioInstanceId: A }),
      titled(GP_FAV_VISIBLE),
    ],
  });
  await prisma.stashScene.createMany({
    data: [
      {
        id: SC_RELATIONS,
        stashInstanceId: A,
        title: "Relations",
        studioId: S_HID,
        inheritedTagIds: JSON.stringify([T_VIS, T_DEL, T_HID]),
      },
      { id: SC_STUDIO_DEL, stashInstanceId: A, studioId: S_DEL },
      { id: SC_FAVORITES, stashInstanceId: A, studioId: S_VIS },
      { id: SC_RELATIONS, stashInstanceId: B, title: "Relations on B" },
    ],
  });
  await prisma.stashImage.createMany({
    data: [
      { id: IM_HIDDEN, stashInstanceId: A },
      { id: IM_DELETED, stashInstanceId: A, deletedAt: deleted },
      { id: IM_VISIBLE, stashInstanceId: A },
      {
        id: IM_RELATIONS,
        stashInstanceId: A,
        studioId: S_HID,
        studioInstanceId: A,
      },
    ],
  });
  await prisma.stashClip.createMany({
    data: [
      [CL_DELETED_PRIMARY, T_DEL],
      [CL_VISIBLE_PRIMARY, T_VIS],
      [CL_HIDDEN_PRIMARY, T_HID],
    ].map(([id, primaryTagId], i) => ({
      id: must(id, "clip id"),
      stashInstanceId: A,
      sceneId: SC_FAVORITES,
      sceneInstanceId: A,
      seconds: i + 1,
      primaryTagId: must(primaryTagId, "primary tag"),
      primaryTagInstanceId: A,
    })),
  });

  // Junctions, each on its parent's instance
  const onA = (parentIds: [string, string], refIds: string[]) =>
    refIds.map((refId) => [parentIds, refId] as const);
  await prisma.scenePerformer.createMany({
    data: [
      ...[P_VIS, P_CASCADE, P_DEL].map((performerId) => ({
        sceneId: SC_RELATIONS,
        sceneInstanceId: A,
        performerId,
        performerInstanceId: A,
      })),
      {
        sceneId: SC_FAVORITES,
        sceneInstanceId: A,
        performerId: P_VIS,
        performerInstanceId: A,
      },
      {
        sceneId: SC_RELATIONS,
        sceneInstanceId: B,
        performerId: P_CASCADE,
        performerInstanceId: B,
      },
    ],
  });
  await prisma.sceneTag.createMany({
    data: [
      ...[T_VIS, T_DEL, T_HID, T_GLOBAL].map((tagId) => ({
        sceneId: SC_RELATIONS,
        sceneInstanceId: A,
        tagId,
        tagInstanceId: A,
      })),
      {
        sceneId: SC_FAVORITES,
        sceneInstanceId: A,
        tagId: T_VIS,
        tagInstanceId: A,
      },
      {
        sceneId: SC_RELATIONS,
        sceneInstanceId: B,
        tagId: T_HID,
        tagInstanceId: B,
      },
    ],
  });
  await prisma.sceneGroup.createMany({
    data: [G_VIS, G_HID, G_DEL].map((groupId, i) => ({
      sceneId: SC_RELATIONS,
      sceneInstanceId: A,
      groupId,
      groupInstanceId: A,
      sceneIndex: i + 2,
    })),
  });
  await prisma.sceneGallery.createMany({
    data: [GL_VIS, GL_HID, GL_DEL].map((galleryId) => ({
      sceneId: SC_RELATIONS,
      sceneInstanceId: A,
      galleryId,
      galleryInstanceId: A,
    })),
  });
  await prisma.galleryPerformer.createMany({
    data: [P_VIS, P_HIDDEN, P_DEL].map((performerId) => ({
      galleryId: GP_RELATIONS,
      galleryInstanceId: A,
      performerId,
      performerInstanceId: A,
    })),
  });
  await prisma.galleryTag.createMany({
    data: [T_VIS, T_DEL, T_HID].map((tagId) => ({
      galleryId: GP_RELATIONS,
      galleryInstanceId: A,
      tagId,
      tagInstanceId: A,
    })),
  });
  await prisma.imageGallery.createMany({
    data: [
      ...onA([IM_RELATIONS, A], [GL_VIS, GL_HID, GL_DEL]),
      [[IM_HIDDEN, A], GP_RELATIONS] as const,
      [[IM_DELETED, A], GP_FAV_DELETED] as const,
      [[IM_VISIBLE, A], GP_FAV_VISIBLE] as const,
    ].map(([[imageId, imageInstanceId], galleryId]) => ({
      imageId,
      imageInstanceId,
      galleryId,
      galleryInstanceId: A,
    })),
  });
  await prisma.imagePerformer.createMany({
    data: [P_VIS, P_HIDDEN, P_DEL].map((performerId) => ({
      imageId: IM_RELATIONS,
      imageInstanceId: A,
      performerId,
      performerInstanceId: A,
    })),
  });
  await prisma.imageTag.createMany({
    data: [T_VIS, T_DEL, T_HID].map((tagId) => ({
      imageId: IM_RELATIONS,
      imageInstanceId: A,
      tagId,
      tagInstanceId: A,
    })),
  });
  await prisma.clipTag.createMany({
    data: [T_VIS, T_DEL, T_HID].map((tagId) => ({
      clipId: CL_DELETED_PRIMARY,
      clipInstanceId: A,
      tagId,
      tagInstanceId: A,
    })),
  });

  // Viewer 1's exclusion rows, as the compute writes them
  const excluded = (
    entityType: string,
    entityId: string,
    reason: string,
    instanceId = A
  ) => ({ userId: viewer1, entityType, entityId, instanceId, reason });
  await prisma.userExcludedEntity.createMany({
    data: [
      excluded("performer", P_CASCADE, "cascade"),
      excluded("performer", P_HIDDEN, "hidden"),
      excluded("tag", T_HID, "hidden"),
      excluded("tag", T_GLOBAL, "hidden", ""),
      excluded("studio", S_HID, "restricted"),
      excluded("group", G_HID, "hidden"),
      excluded("gallery", GL_HID, "hidden"),
      excluded("image", IM_HIDDEN, "hidden"),
    ],
  });
  // Viewer 1 favorited three images
  await prisma.imageRating.createMany({
    data: [IM_HIDDEN, IM_DELETED, IM_VISIBLE].map((imageId) => ({
      userId: viewer1,
      instanceId: A,
      imageId,
      favorite: true,
    })),
  });
}

describeWithDb(
  "Nested refs on list rows: only what the viewer may see, never Stash's favorite or rating (integration)",
  () => {
    beforeAll(async () => {
      await removeRows();
      await seed();
    });

    afterAll(async () => {
      await removeRows();
    });

    describe("scenes", () => {
      it("a scene's performer excluded through a tag is not listed on the scene", async () => {
        expect(ids((await scene(viewer1, SC_RELATIONS)).performers)).toEqual([
          P_VIS,
        ]);
        // Another viewer sees it; nobody sees the deleted one
        expect(ids((await scene(viewer2, SC_RELATIONS)).performers)).toEqual([
          P_VIS,
          P_CASCADE,
        ]);
      });

      it("a soft-deleted tag is not listed on its scenes", async () => {
        const row = await scene(viewer2, SC_RELATIONS);

        expect(ids(row.tags)).toEqual([T_VIS, T_HID, T_GLOBAL]);
        expect(ids(row.inheritedTags)).toEqual([T_VIS, T_HID]);
      });

      it("a scene names none of the viewer's hidden tags (a global row too), collections, galleries or studio", async () => {
        const row = await scene(viewer1, SC_RELATIONS);

        expect(ids(row.tags)).toEqual([T_VIS]);
        expect(ids(row.inheritedTags)).toEqual([T_VIS]);
        expect(row.groups.map((g) => [g.id, g.scene_index])).toEqual([
          [G_VIS, 2],
        ]);
        expect(ids(row.galleries)).toEqual([GL_VIS]);
        expect(row.studio).toBeNull();
        // Viewer 2 sees the studio; a deleted studio shows to nobody
        expect((await scene(viewer2, SC_RELATIONS)).studio?.id).toBe(S_HID);
        expect((await scene(viewer2, SC_STUDIO_DEL)).studio).toBeNull();
      });

      it("an exclusion on one instance leaves the same id on another instance listed", async () => {
        const onB = await scene(viewer1, SC_RELATIONS, B);

        expect(onB.performers.map((p) => [p.id, p.instanceId])).toEqual([
          [P_CASCADE, B],
        ]);
        expect(onB.tags.map((t) => [t.id, t.instanceId])).toEqual([[T_HID, B]]);
      });

      it("Stash's own favorite and rating on a performer, tag and studio never reach a scene list", async () => {
        const row = await scene(viewer1, SC_FAVORITES);
        const performer = must(row.performers[0], "the performer");
        const tag = must(row.tags[0], "the tag");
        const studio = must(row.studio, "the studio");

        expect(performer.id).toBe(P_VIS);
        expect(performer).not.toHaveProperty("favorite");
        expect(performer).not.toHaveProperty("rating100");
        expect(tag.id).toBe(T_VIS);
        expect(tag).not.toHaveProperty("favorite");
        expect(studio.id).toBe(S_VIS);
        expect(studio).not.toHaveProperty("favorite");
        expect(studio).not.toHaveProperty("rating100");
      });

      it("a page's nested refs load in one statement per relation, driven from the page's pairs", async () => {
        const recorder = recordStatements();
        try {
          await sceneQueryBuilder.execute({
            ...listOptions(viewer1),
            request: parsedListRequest("scene", {
              filter: {
                ids: idsOf([
                  [SC_RELATIONS, A],
                  [SC_STUDIO_DEL, A],
                  [SC_FAVORITES, A],
                  [SC_RELATIONS, B],
                ]),
              },
            }),
          });
        } finally {
          recorder.restore();
        }

        // After the page and the count: performers, tags, inherited tags,
        // collections, galleries, studios
        const relations = recorder.statements.slice(2);
        expect(relations).toHaveLength(6);
        for (const statement of relations) {
          expect(statement.sql).toContain("json_each(?)");
          expect(statement.sql).toContain("CROSS JOIN");
          expect(statement.sql).toContain("x.deletedAt IS NULL");
          expect(statement.sql).toContain(
            "(e.instanceId = '' OR e.instanceId = x.stashInstanceId)"
          );
        }
      });
    });

    describe("galleries", () => {
      it("a gallery's hidden performer is not listed on the gallery", async () => {
        const forViewer1 = await gallery(viewer1, GP_RELATIONS);
        const forViewer2 = await gallery(viewer2, GP_RELATIONS);

        expect(ids(forViewer1.performers)).toEqual([P_VIS]);
        expect(ids(forViewer1.tags)).toEqual([T_VIS]);
        expect(forViewer1.studio).toBeNull();
        expect(ids(forViewer2.performers)).toEqual([P_VIS, P_HIDDEN]);
        expect(ids(forViewer2.tags)).toEqual([T_VIS, T_HID]);
        expect(forViewer2.studio?.id).toBe(S_HID);
      });

      it("a gallery's refs carry no favorite or rating100 of Stash's", async () => {
        const row = await gallery(viewer1, GP_RELATIONS);
        const withStudio = await gallery(viewer1, GP_FAV_DELETED);

        expect(must(row.performers[0], "the performer")).not.toHaveProperty(
          "favorite"
        );
        expect(must(row.tags[0], "the tag")).not.toHaveProperty("favorite");
        expect(withStudio.studio).toEqual({
          id: S_VIS,
          instanceId: A,
          name: `${S_VIS} on ${A}`,
          image_path: null,
          parent_studio: null,
        });
      });

      it("hasFavoriteImage counts only live images the viewer can see", async () => {
        const { items } = await galleryQueryBuilder.execute({
          ...listOptions(viewer1),
          request: parsedListRequest("gallery", {
            perPage: 50,
            filter: {
              hasFavoriteImage: true,
              ids: idsOf(
                [GP_RELATIONS, GP_FAV_DELETED, GP_FAV_VISIBLE].map(
                  (id) => [id, A] as const
                )
              ),
            },
          }),
        });

        expect(ids(items)).toEqual([GP_FAV_VISIBLE]);
      });
    });

    it("an image lists only the live performers, tags, galleries and studio the viewer can see", async () => {
      const request = parsedListRequest("image", {
        filter: { ids: idsOf([[IM_RELATIONS, A]]) },
      });
      const forViewer1 = must(
        (await imageQueryBuilder.execute({ ...listOptions(viewer1), request }))
          .items[0],
        "the image for viewer 1"
      );
      const forViewer2 = must(
        (await imageQueryBuilder.execute({ ...listOptions(viewer2), request }))
          .items[0],
        "the image for viewer 2"
      );

      expect(ids(forViewer1.performers)).toEqual([P_VIS]);
      expect(ids(forViewer1.tags)).toEqual([T_VIS]);
      expect(ids(forViewer1.galleries)).toEqual([GL_VIS]);
      expect(forViewer1.studio).toBeNull();
      expect(ids(forViewer2.performers)).toEqual([P_VIS, P_HIDDEN]);
      expect(ids(forViewer2.galleries)).toEqual([GL_VIS, GL_HID]);
      expect(forViewer2.studio?.id).toBe(S_HID);
      expect(must(forViewer1.performers[0], "P_VIS")).not.toHaveProperty(
        "rating100"
      );
      expect(must(forViewer1.tags[0], "T_VIS")).not.toHaveProperty("favorite");
    });

    it("a collection's studio shows only while the viewer can see it, and carries no Stash favorite", async () => {
      const studioOf = async (userId: number, id: string) =>
        must(
          (
            await groupQueryBuilder.execute({
              ...listOptions(userId),
              request: parsedListRequest("group", {
                filter: { ids: idsOf([[id, A]]) },
              }),
            })
          ).items[0],
          `collection ${id}`
        ).studio;

      expect(await studioOf(viewer1, GR_STUDIO_HID)).toBeNull();
      expect((await studioOf(viewer2, GR_STUDIO_HID))?.id).toBe(S_HID);
      expect(await studioOf(viewer2, GR_STUDIO_DEL)).toBeNull();
      expect(await studioOf(viewer1, GR_STUDIO_VIS)).toEqual({
        id: S_VIS,
        instanceId: A,
        name: `${S_VIS} on ${A}`,
        image_path: null,
        parent_studio: null,
      });
    });

    it("a clip lists neither a deleted nor a hidden tag, and a deleted or hidden primary tag is no chip", async () => {
      const { items } = await clipQueryBuilder.execute({
        ...listOptions(viewer1),
        request: parsedClipRequest({
          perPage: 10,
          sort: { field: "seconds", direction: "ASC", seed: undefined },
          filter: {
            sceneId: {
              refs: [{ id: SC_FAVORITES, instanceId: A }],
              modifier: "INCLUDES",
              depth: 0,
            },
          },
        }),
      });

      expect(
        items.map((clip) => [clip.id, clip.primaryTag?.id ?? null])
      ).toEqual([
        [CL_DELETED_PRIMARY, null],
        [CL_VISIBLE_PRIMARY, T_VIS],
        [CL_HIDDEN_PRIMARY, null],
      ]);
      expect(ids(must(items[0], "the first clip").tags)).toEqual([T_VIS]);
    });
  }
);
