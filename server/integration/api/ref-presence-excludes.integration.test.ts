import type {
  EntityKind,
  FieldSpec,
} from "@peek/shared-types/filters/index.js";
import { FIELDS } from "@peek/shared-types/filters/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import { parseListRequest } from "../../utils/listRequest.js";

/**
 * Ref presence ("has none" IS_NULL, "has any" NOT_NULL, sent with no
 * values) and `excludes` beside a ref's values, from the wire through the
 * parser into the scene builder, on seeded rows.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do.
 * - rp-a tags: 7898001; 7898002 with its child 7898003. rp-b tag 7898002.
 * - rp-a performers: 7898201 live; 7898202 deleted; 7898203 hidden by the
 *   viewer on every instance (no cascade is seeded, so its scene stays
 *   listed). rp-b performer 7898201.
 * - rp-a studio 7898101, group 7898401, gallery 7898501; rp-b studio 7898101.
 * - rp-a scenes: 7898301 tag 1, performer 1, studio, group, gallery;
 *   7898302 tags 1 and 3, only the deleted performer; 7898303 nothing but
 *   the studio; 7898304 inherits tag 1, performer 1; 7898305 nothing,
 *   hidden by the viewer; 7898306 tag 2; 7898307 only the hidden performer.
 * - rp-b scenes: 7898301 tag 2, nothing else; 7898303 performer 1, studio.
 * Every seeded row is deleted before the file ends.
 */
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb("Ref presence and excludes (seeded)", () => {
  const A = "rp-a";
  const B = "rp-b";
  const VIEWER = "rp-viewer";
  let viewerId = 0;

  const key = (id: string, instance: string) => `${id}:${instance}`;
  const VISIBLE = [
    key("7898301", A),
    key("7898302", A),
    key("7898303", A),
    key("7898304", A),
    key("7898306", A),
    key("7898307", A),
    key("7898301", B),
    key("7898303", B),
  ].sort();
  const HIDDEN = key("7898305", A);

  async function removeRows(): Promise<void> {
    const where = { stashInstanceId: { in: [A, B] } };
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashTag.deleteMany({ where });
    await prisma.stashStudio.deleteMany({ where });
    await prisma.stashPerformer.deleteMany({ where });
    await prisma.stashGroup.deleteMany({ where });
    await prisma.stashGallery.deleteMany({ where });
    await prisma.user.deleteMany({ where: { username: VIEWER } });
  }

  /** The scenes a wire `scene_filter` lists for the viewer, as sorted keys */
  async function scenesFor(
    sceneFilter: Record<string, unknown>,
    sort: "created_at" | "rating" = "created_at"
  ): Promise<string[]> {
    const request = parseListRequest(
      "scene",
      { filter: { per_page: 50, sort }, scene_filter: sceneFilter },
      { userId: viewerId }
    );
    const { items, total } = await sceneQueryBuilder.execute({
      userId: viewerId,
      allowedInstanceIds: [A, B],
      request,
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

    const tag = (id: string, instance: string, parents: string[] = []) => ({
      id,
      stashInstanceId: instance,
      name: `RP tag ${id} ${instance}`,
      parentIds: JSON.stringify(parents),
    });
    await prisma.stashTag.createMany({
      data: [
        tag("7898001", A),
        tag("7898002", A),
        tag("7898003", A, ["7898002"]),
        tag("7898002", B),
      ],
    });
    await prisma.stashStudio.createMany({
      data: [A, B].map((instance) => ({
        id: "7898101",
        stashInstanceId: instance,
        name: `RP studio ${instance}`,
      })),
    });
    await prisma.stashPerformer.createMany({
      data: [
        { id: "7898201", stashInstanceId: A, name: "RP live" },
        {
          id: "7898202",
          stashInstanceId: A,
          name: "RP deleted",
          deletedAt: new Date(),
        },
        { id: "7898203", stashInstanceId: A, name: "RP hidden" },
        { id: "7898201", stashInstanceId: B, name: "RP live b" },
      ],
    });
    await prisma.stashGroup.create({
      data: { id: "7898401", stashInstanceId: A, name: "RP group" },
    });
    await prisma.stashGallery.create({
      data: { id: "7898501", stashInstanceId: A, title: "RP gallery" },
    });
    const scene = (
      id: string,
      instance: string,
      studioId: string | null,
      tagCount: number,
      performerCount: number
    ) => ({
      id,
      stashInstanceId: instance,
      title: `RP ${id} ${instance}`,
      studioId,
      tagCount,
      performerCount,
    });
    await prisma.stashScene.createMany({
      data: [
        scene("7898301", A, "7898101", 1, 1),
        scene("7898302", A, null, 2, 1),
        scene("7898303", A, "7898101", 0, 0),
        scene("7898304", A, null, 0, 1),
        scene("7898305", A, null, 0, 0),
        scene("7898306", A, null, 1, 0),
        scene("7898307", A, null, 0, 1),
        scene("7898301", B, null, 1, 0),
        scene("7898303", B, "7898101", 0, 1),
      ],
    });
    const sceneTag = (sceneId: string, instance: string, tagId: string) => ({
      sceneId,
      sceneInstanceId: instance,
      tagId,
      tagInstanceId: instance,
    });
    await prisma.sceneTag.createMany({
      data: [
        sceneTag("7898301", A, "7898001"),
        sceneTag("7898302", A, "7898001"),
        sceneTag("7898302", A, "7898003"),
        sceneTag("7898306", A, "7898002"),
        sceneTag("7898301", B, "7898002"),
      ],
    });
    await prisma.sceneInheritedTag.create({
      data: sceneTag("7898304", A, "7898001"),
    });
    const link = (sceneId: string, instance: string, performerId: string) => ({
      sceneId,
      sceneInstanceId: instance,
      performerId,
      performerInstanceId: instance,
    });
    await prisma.scenePerformer.createMany({
      data: [
        link("7898301", A, "7898201"),
        link("7898302", A, "7898202"),
        link("7898304", A, "7898201"),
        link("7898307", A, "7898203"),
        link("7898303", B, "7898201"),
      ],
    });
    await prisma.sceneGroup.create({
      data: {
        sceneId: "7898301",
        sceneInstanceId: A,
        groupId: "7898401",
        groupInstanceId: A,
      },
    });
    await prisma.sceneGallery.create({
      data: {
        sceneId: "7898301",
        sceneInstanceId: A,
        galleryId: "7898501",
        galleryInstanceId: A,
      },
    });
    await prisma.userExcludedEntity.createMany({
      data: [
        {
          userId: viewerId,
          entityType: "scene",
          entityId: "7898305",
          instanceId: A,
          reason: "hidden",
        },
        {
          userId: viewerId,
          entityType: "performer",
          entityId: "7898203",
          instanceId: "",
          reason: "hidden",
        },
      ],
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("has no performers lists exactly the scenes with none on their own instance", async () => {
    expect(await scenesFor({ performers: { modifier: "IS_NULL" } })).toEqual(
      [
        key("7898302", A),
        key("7898303", A),
        key("7898306", A),
        key("7898307", A),
        key("7898301", B),
      ].sort()
    );
  });

  it("has any performers is its complement, and the same id on the other instance never counts", async () => {
    const any = await scenesFor({ performers: { modifier: "NOT_NULL" } });
    expect(any).toEqual(
      [key("7898301", A), key("7898304", A), key("7898303", B)].sort()
    );
    // 7898301 has a performer on rp-a only, 7898303 on rp-b only
    expect(any).not.toContain(key("7898301", B));
    expect(any).not.toContain(key("7898303", A));
  });

  it("a scene whose only performer is deleted has none, not any", async () => {
    expect(await scenesFor({ performers: { modifier: "IS_NULL" } })).toContain(
      key("7898302", A)
    );
    expect(
      await scenesFor({ performers: { modifier: "NOT_NULL" } })
    ).not.toContain(key("7898302", A));
  });

  it("a performer the viewer hid on every instance never makes a scene have any", async () => {
    expect(await scenesFor({ performers: { modifier: "IS_NULL" } })).toContain(
      key("7898307", A)
    );
    expect(
      await scenesFor({ performers: { modifier: "NOT_NULL" } })
    ).not.toContain(key("7898307", A));
  });

  it("has no tags equals tagged false: own and inherited tags count", async () => {
    const none = await scenesFor({ tags: { modifier: "IS_NULL" } });
    // 7898304 has only an inherited tag, so it is not listed
    expect(none).toEqual(
      [key("7898303", A), key("7898307", A), key("7898303", B)].sort()
    );
    expect(none).toEqual(await scenesFor({ tagged: false }));
    expect(await scenesFor({ tags: { modifier: "NOT_NULL" } })).toEqual(
      await scenesFor({ tagged: true })
    );
  });

  it("has no studio lists the scenes without one", async () => {
    expect(await scenesFor({ studios: { modifier: "IS_NULL" } })).toEqual(
      [
        key("7898302", A),
        key("7898304", A),
        key("7898306", A),
        key("7898307", A),
        key("7898301", B),
      ].sort()
    );
  });

  it("has any collection and has any gallery list the scene that has one", async () => {
    expect(await scenesFor({ groups: { modifier: "NOT_NULL" } })).toEqual([
      key("7898301", A),
    ]);
    expect(await scenesFor({ galleries: { modifier: "NOT_NULL" } })).toEqual([
      key("7898301", A),
    ]);
  });

  it.each(["performers", "tags", "studios", "groups", "galleries"])(
    "%s: none plus any is the viewer's library, and a hidden scene is under neither",
    async (field) => {
      const none = await scenesFor({ [field]: { modifier: "IS_NULL" } });
      const any = await scenesFor({ [field]: { modifier: "NOT_NULL" } });
      expect([...none, ...any].sort()).toEqual(VISIBLE);
      expect(none.filter((k) => any.includes(k))).toEqual([]);
      expect([...none, ...any]).not.toContain(HIDDEN);
    }
  );

  it("tags INCLUDES 1 with excludes 2 at depth -1 drops scenes holding any descendant of 2", async () => {
    const tags = {
      value: [key("7898001", A)],
      excludes: [key("7898002", A)],
      modifier: "INCLUDES",
      depth: -1,
    };
    // 7898302 holds tag 1 and tag 3, a child of tag 2
    expect(await scenesFor({ tags })).toEqual(
      [key("7898301", A), key("7898304", A)].sort()
    );
    expect(await scenesFor({ tags }, "rating")).toEqual(
      await scenesFor({ tags })
    );
  });

  it("excludes on one instance never drop a scene tagged with the same id on the other", async () => {
    const listed = await scenesFor({
      tags: { value: [], excludes: [key("7898002", A)], depth: -1 },
    });
    expect(listed).toContain(key("7898301", B));
    expect(listed).not.toContain(key("7898302", A));
    expect(listed).not.toContain(key("7898306", A));
    expect(listed).not.toContain(HIDDEN);
  });

  it("has any tags with excludes keeps both conditions", async () => {
    expect(
      await scenesFor({
        tags: {
          modifier: "NOT_NULL",
          excludes: [key("7898002", A)],
          depth: -1,
        },
      })
    ).toEqual([key("7898301", A), key("7898304", A), key("7898301", B)].sort());
  });
});

/**
 * Every ref field that offers presence, and every excludable one, on the
 * replay's library: each statement runs, "has none" and "has any" split the
 * list, and an exclude never adds a row.
 */
describeWithDb(
  "Ref presence and excludes on every list (replay library)",
  () => {
    const VIEWER = "rp-every-list";
    let viewerId = 0;
    let instances: string[] = [];

    /** The list's total for a wire filter, through the parser and its builder */
    async function count(
      kind: EntityKind,
      filter: Record<string, unknown>
    ): Promise<number> {
      const opts = { userId: viewerId };
      const base = { userId: viewerId, allowedInstanceIds: instances };
      switch (kind) {
        case "scene":
          return sceneQueryBuilder.count({
            ...base,
            request: parseListRequest("scene", { scene_filter: filter }, opts),
          });
        case "performer":
          return performerQueryBuilder.count({
            ...base,
            request: parseListRequest(
              "performer",
              { performer_filter: filter },
              opts
            ),
          });
        case "studio":
          return studioQueryBuilder.count({
            ...base,
            request: parseListRequest(
              "studio",
              { studio_filter: filter },
              opts
            ),
          });
        case "tag":
          return tagQueryBuilder.count({
            ...base,
            request: parseListRequest("tag", { tag_filter: filter }, opts),
          });
        case "group":
          return groupQueryBuilder.count({
            ...base,
            request: parseListRequest("group", { group_filter: filter }, opts),
          });
        case "gallery":
          return galleryQueryBuilder.count({
            ...base,
            request: parseListRequest(
              "gallery",
              { gallery_filter: filter },
              opts
            ),
          });
        case "image":
          return imageQueryBuilder.count({
            ...base,
            request: parseListRequest("image", { image_filter: filter }, opts),
          });
      }
    }

    beforeAll(async () => {
      await prisma.user.deleteMany({ where: { username: VIEWER } });
      viewerId = (
        await prisma.user.create({
          data: { username: VIEWER, password: "not-a-real-hash", role: "USER" },
        })
      ).id;
      instances = (
        await prisma.stashInstance.findMany({ select: { id: true } })
      ).map((i) => i.id);
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { username: VIEWER } });
    });

    const presenceFields = Object.entries(FIELDS).flatMap(([kind, fields]) =>
      Object.entries(fields).flatMap(([field, spec]: [string, FieldSpec]) =>
        spec.kind === "ref" &&
        (spec.modifiers as readonly string[]).includes("IS_NULL")
          ? [[kind as EntityKind, field] as const]
          : []
      )
    );
    const excludableFields = Object.entries(FIELDS).flatMap(([kind, fields]) =>
      Object.entries(fields).flatMap(([field, spec]: [string, FieldSpec]) =>
        spec.kind === "ref" && spec.excludable
          ? [[kind as EntityKind, field] as const]
          : []
      )
    );

    it.each(presenceFields)(
      "%s %s: has none plus has any is the whole list",
      async (kind, field) => {
        const all = await count(kind, {});
        const none = await count(kind, { [field]: { modifier: "IS_NULL" } });
        const any = await count(kind, { [field]: { modifier: "NOT_NULL" } });
        expect(none + any).toBe(all);
      }
    );

    it.each(excludableFields)(
      "%s %s: an exclude beside no value never adds a row",
      async (kind, field) => {
        const all = await count(kind, {});
        const excluded = await count(kind, {
          [field]: { value: [], excludes: ["1"] },
        });
        expect(excluded).toBeLessThanOrEqual(all);
      }
    );
  }
);
