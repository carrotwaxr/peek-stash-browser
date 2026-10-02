/**
 * The scene, image and gallery filter for performer tags (`performer_tags`,
 * item 65), from the wire through the parser into each builder, on seeded
 * rows: an item matches through the tags of its performers.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do.
 * - Tags: 1, 2 (child of 1), 3 (child of 2), 4, 5, 6 on ptf-x; 1 and 4 on
 *   ptf-y. Ids are 7895000 + n.
 * - ptf-x performers (7895200 + n): 1 tag 1; 2 tag 2; 3 tag 3; 4 tags 1
 *   and 4; 5 deleted, tag 4; 6 tag 6; 7 tag 5; 8 tag 4; 9 no tag. ptf-y
 *   performers: 1 tag 4, 4 tag 1.
 * - ptf-x scenes (7895300 + n): 1 performer 1; 2 performer 2; 3 performer
 *   3; 4 performer 4; 5 performers 1 and 8; 6 only the deleted performer
 *   5; 7 no performer; 8 performer 6; 9 performer 7; 10 performer 1;
 *   11 performer 9. ptf-y scenes: 1 performer 1, 4 performer 4.
 * - Images (7895400 + n) and galleries (7895500 + n) hold the same
 *   performers as the scene of the same n, on the same instance.
 * - Viewer A hides nothing. Viewer B hid performer 6 (every instance),
 *   tag 5, and scene, image and gallery 10 on ptf-x; no cascade is seeded,
 *   so the clause itself must keep a hidden performer or tag from matching.
 * Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { parseListRequest } from "../../utils/listRequest.js";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const X = "ptf-x";
const Y = "ptf-y";
const INSTANCES = [X, Y];
const PREFIX = "ptf-it";

const tid = (n: number) => String(7895000 + n);
const pid = (n: number) => String(7895200 + n);
const sid = (n: number) => String(7895300 + n);
const iid = (n: number) => String(7895400 + n);
const gid = (n: number) => String(7895500 + n);
const tagRef = (n: number, instance?: string) =>
  instance === undefined ? tid(n) : `${tid(n)}:${instance}`;

/** Every ptf-x scene, and every ptf-y one */
const ALL_X = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const ALL_Y = [1, 4];

describeWithDb("Performer tags filter (seeded)", () => {
  const user = { A: 0, B: 0 };

  async function removeRows(): Promise<void> {
    await prisma.user.deleteMany({
      where: { username: { startsWith: PREFIX } },
    });
    // Junctions cascade with their scene, performer or tag
    const where = { stashInstanceId: { in: INSTANCES } };
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashImage.deleteMany({ where });
    await prisma.stashGallery.deleteMany({ where });
    await prisma.stashPerformer.deleteMany({ where });
    await prisma.stashTag.deleteMany({ where });
  }

  /** The scenes a wire `scene_filter` lists, as numbers per instance */
  async function listed(
    viewer: number,
    sceneFilter: Record<string, unknown>,
    sort: "created_at" | "rating" = "created_at"
  ): Promise<{ x: number[]; y: number[] }> {
    const request = parseListRequest(
      "scene",
      { filter: { per_page: 250, sort }, scene_filter: sceneFilter },
      { userId: viewer }
    );
    const { items, total } = await sceneQueryBuilder.execute({
      userId: viewer,
      allowedInstanceIds: INSTANCES,
      request,
    });
    expect(total).toBe(items.length);
    const of = (instance: string) =>
      items
        .filter((s) => s.instanceId === instance)
        .map((s) => Number(s.id) - 7895300)
        .sort((a, b) => a - b);
    return { x: of(X), y: of(Y) };
  }

  /** The images or galleries a wire filter lists, as numbers per instance */
  async function listedOf(
    kind: "image" | "gallery",
    viewer: number,
    filter: Record<string, unknown>,
    sort: "created_at" | "title" | "rating" = "created_at"
  ): Promise<{ x: number[]; y: number[] }> {
    const body = { filter: { per_page: 250, sort } };
    const { items, total } =
      kind === "image"
        ? await imageQueryBuilder.execute({
            userId: viewer,
            allowedInstanceIds: INSTANCES,
            request: parseListRequest(
              "image",
              { ...body, image_filter: filter },
              { userId: viewer }
            ),
          })
        : await galleryQueryBuilder.execute({
            userId: viewer,
            allowedInstanceIds: INSTANCES,
            request: parseListRequest(
              "gallery",
              { ...body, gallery_filter: filter },
              { userId: viewer }
            ),
          });
    expect(total).toBe(items.length);
    const base = kind === "image" ? 7895400 : 7895500;
    const of = (instance: string) =>
      items
        .filter((item) => item.instanceId === instance)
        .map((item) => Number(item.id) - base)
        .sort((a, b) => a - b);
    return { x: of(X), y: of(Y) };
  }

  const tags = (
    value: string[],
    modifier = "INCLUDES",
    extra: Record<string, unknown> = {}
  ) => ({ performer_tags: { value, modifier, ...extra } });

  beforeAll(async () => {
    await removeRows();

    const makeUser = async (name: string) =>
      (
        await prisma.user.create({
          data: {
            username: `${PREFIX}-${name}`,
            password: "not-a-real-hash",
            role: "USER",
          },
        })
      ).id;
    user.A = await makeUser("a");
    user.B = await makeUser("b");

    const tag = (n: number, instance: string, parent?: number) => ({
      id: tid(n),
      stashInstanceId: instance,
      name: `PTF tag ${n} ${instance}`,
      parentIds: JSON.stringify(parent === undefined ? [] : [tid(parent)]),
    });
    await prisma.stashTag.createMany({
      data: [
        tag(1, X),
        tag(2, X, 1),
        tag(3, X, 2),
        tag(4, X),
        tag(5, X),
        tag(6, X),
        tag(1, Y),
        tag(4, Y),
      ],
    });

    const performer = (n: number, instance: string, deleted = false) => ({
      id: pid(n),
      stashInstanceId: instance,
      name: `PTF performer ${n} ${instance}`,
      ...(deleted ? { deletedAt: new Date() } : {}),
    });
    await prisma.stashPerformer.createMany({
      data: [
        ...[1, 2, 3, 4, 6, 7, 8, 9].map((n) => performer(n, X)),
        performer(5, X, true),
        performer(1, Y),
        performer(4, Y),
      ],
    });
    const performerTag = (p: number, t: number, instance: string) => ({
      performerId: pid(p),
      performerInstanceId: instance,
      tagId: tid(t),
      tagInstanceId: instance,
    });
    await prisma.performerTag.createMany({
      data: [
        performerTag(1, 1, X),
        performerTag(2, 2, X),
        performerTag(3, 3, X),
        performerTag(4, 1, X),
        performerTag(4, 4, X),
        performerTag(5, 4, X),
        performerTag(6, 6, X),
        performerTag(7, 5, X),
        performerTag(8, 4, X),
        performerTag(1, 4, Y),
        performerTag(4, 1, Y),
      ],
    });

    await prisma.stashScene.createMany({
      data: [
        ...ALL_X.map((n) => ({
          id: sid(n),
          stashInstanceId: X,
          title: `PTF ${n} ${X}`,
        })),
        ...ALL_Y.map((n) => ({
          id: sid(n),
          stashInstanceId: Y,
          title: `PTF ${n} ${Y}`,
        })),
      ],
    });
    const link = (s: number, p: number, instance: string) => ({
      sceneId: sid(s),
      sceneInstanceId: instance,
      performerId: pid(p),
      performerInstanceId: instance,
    });
    await prisma.scenePerformer.createMany({
      data: [
        link(1, 1, X),
        link(2, 2, X),
        link(3, 3, X),
        link(4, 4, X),
        link(5, 1, X),
        link(5, 8, X),
        link(6, 5, X),
        link(8, 6, X),
        link(9, 7, X),
        link(10, 1, X),
        link(11, 9, X),
        link(1, 1, Y),
        link(4, 4, Y),
      ],
    });

    // Images and galleries with the scenes' performers
    const items = (instance: string, ns: number[], id: (n: number) => string) =>
      ns.map((n) => ({
        id: id(n),
        stashInstanceId: instance,
        title: `PTF ${n} ${instance}`,
      }));
    await prisma.stashImage.createMany({
      data: [...items(X, ALL_X, iid), ...items(Y, ALL_Y, iid)],
    });
    await prisma.stashGallery.createMany({
      data: [...items(X, ALL_X, gid), ...items(Y, ALL_Y, gid)],
    });
    const sceneLinks = await prisma.scenePerformer.findMany({
      where: { sceneInstanceId: { in: INSTANCES } },
    });
    await prisma.imagePerformer.createMany({
      data: sceneLinks.map((l) => ({
        imageId: iid(Number(l.sceneId) - 7895300),
        imageInstanceId: l.sceneInstanceId,
        performerId: l.performerId,
        performerInstanceId: l.performerInstanceId,
      })),
    });
    await prisma.galleryPerformer.createMany({
      data: sceneLinks.map((l) => ({
        galleryId: gid(Number(l.sceneId) - 7895300),
        galleryInstanceId: l.sceneInstanceId,
        performerId: l.performerId,
        performerInstanceId: l.performerInstanceId,
      })),
    });

    // B's exclusions, without the cascades a recompute would add
    await prisma.userExcludedEntity.createMany({
      data: [
        { entityType: "performer", entityId: pid(6), instanceId: "" },
        { entityType: "tag", entityId: tid(5), instanceId: X },
        { entityType: "scene", entityId: sid(10), instanceId: X },
        { entityType: "image", entityId: iid(10), instanceId: X },
        { entityType: "gallery", entityId: gid(10), instanceId: X },
      ].map((row) => ({ ...row, userId: user.B, reason: "hidden" })),
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("a scene matches when one of its performers has the tag", async () => {
    expect(await listed(user.A, tags([tagRef(1, X)]))).toEqual({
      x: [1, 4, 5, 10],
      y: [],
    });
    // Depth 0: a child tag matches its own performers only
    expect(await listed(user.A, tags([tagRef(3, X)]))).toEqual({
      x: [3],
      y: [],
    });
    // Read in no order (a sort with no index), the same scenes
    expect(await listed(user.A, tags([tagRef(1, X)]), "rating")).toEqual({
      x: [1, 4, 5, 10],
      y: [],
    });
  });

  it("depth -1 adds the tag's descendants", async () => {
    expect(
      await listed(user.A, tags([tagRef(1, X)], "INCLUDES", { depth: -1 }))
    ).toEqual({
      x: [1, 2, 3, 4, 5, 10],
      y: [],
    });
    // Depth 1 stops at the children
    expect(
      await listed(user.A, tags([tagRef(1, X)], "INCLUDES", { depth: 1 }))
    ).toEqual({
      x: [1, 2, 4, 5, 10],
      y: [],
    });
  });

  it("INCLUDES_ALL needs each tag on some performer of the scene", async () => {
    // Scene 4 has one performer with both, scene 5 one performer for each
    expect(
      await listed(user.A, tags([tagRef(1, X), tagRef(4, X)], "INCLUDES_ALL"))
    ).toEqual({ x: [4, 5], y: [] });
    // With a depth each chosen tag brings its own descendants
    expect(
      await listed(
        user.A,
        tags([tagRef(1, X), tagRef(4, X)], "INCLUDES_ALL", { depth: -1 })
      )
    ).toEqual({ x: [4, 5], y: [] });
    expect(
      await listed(user.A, tags([tagRef(2, X), tagRef(4, X)], "INCLUDES_ALL"))
    ).toEqual({ x: [], y: [] });
  });

  it("EXCLUDES drops scenes with any such performer", async () => {
    // Scene 6's only performer is deleted, so its tag 4 does not drop it;
    // tag 4 on ptf-y is another tag
    expect(await listed(user.A, tags([tagRef(4, X)], "EXCLUDES"))).toEqual({
      x: [1, 2, 3, 6, 7, 8, 9, 10, 11],
      y: ALL_Y,
    });
    expect(
      await listed(user.A, tags([tagRef(1, X)], "EXCLUDES", { depth: -1 }))
    ).toEqual({ x: [6, 7, 8, 9, 11], y: ALL_Y });
    // `excludes` beside the values
    expect(
      await listed(
        user.A,
        tags([tagRef(1, X)], "INCLUDES", { excludes: [tagRef(4, X)] })
      )
    ).toEqual({ x: [1, 10], y: [] });
    // `excludes` alone, with the depth
    expect(
      await listed(
        user.A,
        tags([], "INCLUDES", { excludes: [tagRef(2, X)], depth: -1 })
      )
    ).toEqual({ x: [1, 4, 5, 6, 7, 8, 9, 10, 11], y: ALL_Y });
  });

  it("a deleted or hidden performer's tags do not count", async () => {
    // The deleted performer 5 holds tag 4
    expect(await listed(user.A, tags([tagRef(4, X)]))).toEqual({
      x: [4, 5],
      y: [],
    });
    // Performer 6, hidden by B, holds tag 6
    expect(await listed(user.A, tags([tagRef(6, X)]))).toEqual({
      x: [8],
      y: [],
    });
    expect(await listed(user.B, tags([tagRef(6, X)]))).toEqual({
      x: [],
      y: [],
    });
    // ... nor does it exclude its scene
    expect(
      (await listed(user.B, tags([tagRef(6, X)], "EXCLUDES"))).x
    ).toContain(8);
    // Tag 5, hidden by B, never makes a match, nor excludes a scene
    expect(await listed(user.A, tags([tagRef(5, X)]))).toEqual({
      x: [9],
      y: [],
    });
    expect(await listed(user.B, tags([tagRef(5, X)]))).toEqual({
      x: [],
      y: [],
    });
    expect(
      (await listed(user.B, tags([tagRef(5, X)], "EXCLUDES"))).x
    ).toContain(9);
  });

  it("a scene the viewer hid is never listed, in any form", async () => {
    for (const filter of [
      tags([tagRef(1, X)]),
      tags([tagRef(1, X)], "INCLUDES", { depth: -1 }),
      tags([tagRef(4, X)], "EXCLUDES"),
      tags([tagRef(1, X), tagRef(4, X)], "INCLUDES_ALL"),
      tags([], "INCLUDES", { excludes: [tagRef(4, X)] }),
    ]) {
      expect((await listed(user.B, filter)).x).not.toContain(10);
    }
  });

  it("two instances reusing ids stay apart", async () => {
    // Tag 4 on ptf-y is held by ptf-y's performer 1 only
    expect(await listed(user.A, tags([tagRef(4, Y)]))).toEqual({
      x: [],
      y: [1],
    });
    expect(await listed(user.A, tags([tagRef(1, Y)]))).toEqual({
      x: [],
      y: [4],
    });
    // A bare id means the tag on every instance
    expect(await listed(user.A, tags([tagRef(1)]))).toEqual({
      x: [1, 4, 5, 10],
      y: [4],
    });
    expect(
      await listed(user.A, tags([tagRef(1)], "INCLUDES", { depth: -1 }))
    ).toEqual({
      x: [1, 2, 3, 4, 5, 10],
      y: [4],
    });
    expect(await listed(user.A, tags([tagRef(4)], "EXCLUDES"))).toEqual({
      x: [1, 2, 3, 6, 7, 8, 9, 10, 11],
      y: [4],
    });
  });

  it("more than 64 tags take the large shape with the same answers", async () => {
    const unknown = Array.from({ length: 70 }, (_, i) => tagRef(900 + i, X));
    const bareUnknown = Array.from({ length: 70 }, (_, i) => tagRef(900 + i));
    for (const sort of ["created_at", "rating"] as const) {
      expect(
        await listed(user.A, tags([tagRef(1, X), ...unknown]), sort)
      ).toEqual({ x: [1, 4, 5, 10], y: [] });
      expect(
        await listed(user.A, tags([tagRef(1), ...bareUnknown]), sort)
      ).toEqual({ x: [1, 4, 5, 10], y: [4] });
      expect(
        await listed(user.A, tags([tagRef(4, X), ...unknown], "EXCLUDES"), sort)
      ).toEqual({ x: [1, 2, 3, 6, 7, 8, 9, 10, 11], y: ALL_Y });
      // The hidden performer and tag stay out in the large shape too
      expect(
        await listed(
          user.B,
          tags([tagRef(5, X), tagRef(6, X), ...unknown]),
          sort
        )
      ).toEqual({ x: [], y: [] });
      expect(
        (
          await listed(
            user.B,
            tags([tagRef(5, X), tagRef(6, X), ...unknown], "EXCLUDES"),
            sort
          )
        ).x
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
    }
  });
  describe.each(["image", "gallery"] as const)("on the %s list", (kind) => {
    const listed = (
      viewer: number,
      filter: Record<string, unknown>,
      sort: "created_at" | "title" | "rating" = "created_at"
    ) => listedOf(kind, viewer, filter, sort);
    // An index sort (images walk theirs) and one without
    const SORTS = ["created_at", "rating"] as const;

    it("an item matches when one of its performers has the tag, to the depth", async () => {
      for (const sort of SORTS) {
        expect(await listed(user.A, tags([tagRef(1, X)]), sort)).toEqual({
          x: [1, 4, 5, 10],
          y: [],
        });
        expect(
          await listed(
            user.A,
            tags([tagRef(1, X)], "INCLUDES", { depth: -1 }),
            sort
          )
        ).toEqual({ x: [1, 2, 3, 4, 5, 10], y: [] });
      }
    });

    it("INCLUDES_ALL needs each tag on some performer of the item", async () => {
      for (const sort of SORTS) {
        expect(
          await listed(
            user.A,
            tags([tagRef(1, X), tagRef(4, X)], "INCLUDES_ALL"),
            sort
          )
        ).toEqual({ x: [4, 5], y: [] });
      }
    });

    it("EXCLUDES and excludes drop items with any such performer", async () => {
      for (const sort of SORTS) {
        expect(
          await listed(user.A, tags([tagRef(4, X)], "EXCLUDES"), sort)
        ).toEqual({ x: [1, 2, 3, 6, 7, 8, 9, 10, 11], y: ALL_Y });
        expect(
          await listed(
            user.A,
            tags([tagRef(1, X)], "INCLUDES", { excludes: [tagRef(4, X)] }),
            sort
          )
        ).toEqual({ x: [1, 10], y: [] });
      }
    });

    it("a deleted or hidden performer's tags, and a hidden tag, do not count", async () => {
      expect(await listed(user.A, tags([tagRef(4, X)]))).toEqual({
        x: [4, 5],
        y: [],
      });
      expect(await listed(user.A, tags([tagRef(6, X)]))).toEqual({
        x: [8],
        y: [],
      });
      expect(await listed(user.B, tags([tagRef(6, X)]))).toEqual({
        x: [],
        y: [],
      });
      expect(
        (await listed(user.B, tags([tagRef(6, X)], "EXCLUDES"))).x
      ).toContain(8);
      expect(await listed(user.B, tags([tagRef(5, X)]))).toEqual({
        x: [],
        y: [],
      });
      expect(
        (await listed(user.B, tags([tagRef(5, X)], "EXCLUDES"))).x
      ).toContain(9);
    });

    it("an item the viewer hid is never listed, in any form", async () => {
      for (const filter of [
        tags([tagRef(1, X)]),
        tags([tagRef(4, X)], "EXCLUDES"),
        tags([tagRef(1, X), tagRef(4, X)], "INCLUDES_ALL"),
        tags([], "INCLUDES", { excludes: [tagRef(4, X)] }),
      ]) {
        expect((await listed(user.A, filter)).x.length).toBeGreaterThan(0);
        expect((await listed(user.B, filter)).x).not.toContain(10);
      }
    });

    it("two instances reusing ids stay apart", async () => {
      expect(await listed(user.A, tags([tagRef(4, Y)]))).toEqual({
        x: [],
        y: [1],
      });
      expect(await listed(user.A, tags([tagRef(1)]))).toEqual({
        x: [1, 4, 5, 10],
        y: [4],
      });
      expect(await listed(user.A, tags([tagRef(4)], "EXCLUDES"))).toEqual({
        x: [1, 2, 3, 6, 7, 8, 9, 10, 11],
        y: [4],
      });
    });

    it("more than 64 tags take the large shape with the same answers", async () => {
      const unknown = Array.from({ length: 70 }, (_, i) => tagRef(900 + i, X));
      for (const sort of SORTS) {
        expect(
          await listed(user.A, tags([tagRef(1, X), ...unknown]), sort)
        ).toEqual({ x: [1, 4, 5, 10], y: [] });
        expect(
          await listed(
            user.A,
            tags([tagRef(4, X), ...unknown], "EXCLUDES"),
            sort
          )
        ).toEqual({ x: [1, 2, 3, 6, 7, 8, 9, 10, 11], y: ALL_Y });
        expect(
          await listed(
            user.B,
            tags([tagRef(5, X), tagRef(6, X), ...unknown]),
            sort
          )
        ).toEqual({ x: [], y: [] });
      }
    });
  });
});
