/**
 * Scene path, URL, code, captions, markers, duplicates and sub-collections
 * (items 63 and 66), from the wire through the parser into the scene
 * builder, on seeded rows.
 *
 * Two made-up instances reusing ids, as two Stash servers do: spx-x and
 * spx-y, both enabled and both selected by every viewer. Scene ids are
 * 7897000 + n. Users: A, whose hides are none, and B, who hid scene 33@x,
 * scene 60@x and clip 22@x. Every seeded row is deleted before the file
 * ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import { parseListRequest } from "../../utils/listRequest.js";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const X = "spx-x";
const Y = "spx-y";
const INSTANCES = [X, Y];
const PREFIX = "spx-it";

const sid = (n: number) => String(7897000 + n);

describeWithDb("Scene parity filters (seeded)", () => {
  const user = { A: 0, B: 0 };

  async function removeRows(): Promise<void> {
    await prisma.user.deleteMany({
      where: { username: { startsWith: PREFIX } },
    });
    // Junctions and clips cascade with their scene or group
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: INSTANCES } },
    });
    await prisma.stashGroup.deleteMany({
      where: { stashInstanceId: { in: INSTANCES } },
    });
    await prisma.stashInstance.deleteMany({ where: { id: { in: INSTANCES } } });
  }

  /** Every key a wire `scene_filter` lists for a viewer, sorted, the count checked */
  async function listed(
    viewer: number,
    sceneFilter: Record<string, unknown>
  ): Promise<string[]> {
    const request = parseListRequest(
      "scene",
      { filter: { per_page: 250 }, scene_filter: sceneFilter },
      { userId: viewer }
    );
    const { items, total } = await sceneQueryBuilder.execute({
      userId: viewer,
      allowedInstanceIds: await getUserAllowedInstanceIds(viewer),
      request,
    });
    const found = items.map((s) => `${s.id}:${s.instanceId}`).sort();
    expect(total).toBe(found.length);
    return found;
  }

  /** The scenes of this file a filter lists, as numbers per instance */
  async function ns(
    viewer: number,
    sceneFilter: Record<string, unknown>,
    instance = X
  ): Promise<number[]> {
    const found = await listed(viewer, sceneFilter);
    const own = found.filter((k) => k.endsWith(`:${instance}`));
    return own
      .map((k) => Number(k.split(":")[0]) - 7897000)
      .sort((a, b) => a - b);
  }

  const text = (field: string, modifier: string, value?: string) => ({
    [field]: value === undefined ? { modifier } : { value, modifier },
  });

  beforeAll(async () => {
    await removeRows();

    for (const [i, id] of INSTANCES.entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: "http://127.0.0.1:9/graphql",
          apiKey: "fixture-key",
          enabled: true,
          priority: 970 + i,
          firstSyncedAt: new Date(),
        },
      });
    }

    const makeUser = async (name: string) =>
      (
        await prisma.user.create({
          data: {
            username: `${PREFIX}-${name}`,
            password: "not-a-real-hash",
            role: "USER",
            stashInstances: {
              create: INSTANCES.map((instanceId) => ({ instanceId })),
            },
          },
        })
      ).id;
    user.A = await makeUser("a");
    user.B = await makeUser("b");

    const scene = (
      n: number,
      instance: string,
      extra: Record<string, unknown> = {}
    ) => ({
      id: sid(n),
      stashInstanceId: instance,
      title: `SPX ${n} ${instance}`,
      ...extra,
    });
    await prisma.stashScene.createMany({
      data: [
        // Paths
        scene(1, X, { filePath: "/a_b/x.mp4" }),
        scene(2, X, { filePath: "/axb/x.mp4" }),
        scene(3, X, { filePath: "/z/a_b/x.mp4" }),
        scene(4, X, { filePath: "/100%/y.mp4" }),
        scene(5, X, { filePath: "/plain/x.mp4" }),
        scene(1, Y, { filePath: "/a_b/other.mp4" }),
        scene(5, Y, { filePath: "/100%/other.mp4" }),
        // URLs
        scene(6, X, {
          urls: JSON.stringify(["https://a.test/1", "https://example.com/2"]),
        }),
        scene(7, X, { urls: JSON.stringify(["https://other.test/"]) }),
        scene(8, X, { urls: null }),
        scene(9, X, { urls: "" }),
        scene(10, X, { urls: "[]" }),
        scene(6, Y, { urls: JSON.stringify(["https://nothing.test/"]) }),
        // Codes
        scene(11, X, { code: "AB_12" }),
        scene(12, X, { code: "ABX12" }),
        // Captions
        scene(13, X, {
          captions: JSON.stringify([
            { language_code: "en", caption_type: "srt" },
          ]),
        }),
        scene(14, X, { captions: JSON.stringify([{ language_code: "de" }]) }),
        scene(15, X, { captions: null }),
        scene(16, X, { captions: "not json {" }),
        scene(17, X, {
          captions: JSON.stringify(["en", { language_code: "fr" }]),
        }),
        scene(13, Y, { captions: JSON.stringify([{ language_code: "de" }]) }),
        // Markers: 20 an ungenerated clip, 21 only a deleted one, 22 only one
        // B hid, 23 a generated one, 24 none, 25 a clip on y only
        scene(20, X),
        scene(21, X),
        scene(22, X),
        scene(23, X),
        scene(24, X),
        scene(20, Y),
        scene(25, Y),
        // Duplicates: 30 and 31 share p1; 32 and 33 share p2 (B hid 33);
        // 34@x and 34@y share p3 across instances; 35 and 36 hold '' ; 37
        // NULL; 38 shares p4 with the deleted 39
        scene(30, X, { phash: "p1" }),
        scene(31, X, { phash: "p1" }),
        scene(32, X, { phash: "p2" }),
        scene(33, X, { phash: "p2" }),
        scene(34, X, { phash: "p3" }),
        scene(34, Y, { phash: "p3" }),
        scene(35, X, { phash: "" }),
        scene(36, X, { phash: "" }),
        scene(37, X, { phash: null }),
        scene(38, X, { phash: "p4" }),
        scene(39, X, { phash: "p4", deletedAt: new Date() }),
        // Collections: 40 in 10, 41 in 11 (11 is in 10), 42 in 12; 41@y in 11@y
        scene(40, X),
        scene(41, X),
        scene(42, X),
        scene(41, Y),
        // Hidden by B, with a clip, a caption, a URL, a path and a twin
        scene(60, X, {
          phash: "p5",
          filePath: "/hidden/x.mp4",
          urls: JSON.stringify(["https://hidden.test/"]),
          captions: JSON.stringify([{ language_code: "es" }]),
        }),
        scene(61, X, { phash: "p5" }),
      ],
    });

    const clip = (
      id: string,
      n: number,
      instance: string,
      extra: Record<string, unknown> = {}
    ) => ({
      id,
      stashInstanceId: instance,
      sceneId: sid(n),
      sceneInstanceId: instance,
      seconds: 10,
      ...extra,
    });
    await prisma.stashClip.createMany({
      data: [
        clip("c20", 20, X, { isGenerated: false }),
        clip("c21", 21, X, { deletedAt: new Date() }),
        clip("c22", 22, X),
        clip("c23", 23, X, { isGenerated: true }),
        clip("c25", 25, Y),
        clip("c60", 60, X),
      ],
    });

    await prisma.stashGroup.createMany({
      data: [10, 11, 12].flatMap((id) =>
        INSTANCES.map((stashInstanceId) => ({
          id: String(id),
          stashInstanceId,
          name: `SPX group ${id}`,
        }))
      ),
    });
    await prisma.groupRelation.createMany({
      data: [
        {
          containingId: "10",
          containingInstanceId: X,
          subId: "11",
          subInstanceId: X,
          orderIndex: 0,
        },
      ],
    });
    await prisma.sceneGroup.createMany({
      data: [
        [40, "10", X],
        [41, "11", X],
        [42, "12", X],
        [41, "11", Y],
      ].map(([n, groupId, instance]) => ({
        sceneId: sid(n as number),
        sceneInstanceId: instance as string,
        groupId: groupId as string,
        groupInstanceId: instance as string,
      })),
    });

    // B's hides and their exclusion rows
    for (const [entityType, entityId] of [
      ["scene", sid(33)],
      ["scene", sid(60)],
      ["clip", "c22"],
    ] as const) {
      await prisma.userHiddenEntity.create({
        data: { userId: user.B, entityType, entityId, instanceId: X },
      });
      await prisma.userExcludedEntity.create({
        data: {
          userId: user.B,
          entityType,
          entityId,
          instanceId: X,
          reason: "hidden",
        },
      });
    }
  });

  afterAll(async () => {
    await removeRows();
  });

  it("path STARTS_WITH matches the start only, literally", async () => {
    // Underscore is itself: /axb/ and /z/a_b/ do not match
    expect(await ns(user.A, text("path", "STARTS_WITH", "/a_b/"))).toEqual([1]);
    // The same path on the other instance is another scene
    expect(await ns(user.A, text("path", "STARTS_WITH", "/a_b/"), Y)).toEqual([
      1,
    ]);
    expect(await ns(user.A, text("path", "STARTS_WITH", "/z/"))).toEqual([3]);
    // INCLUDES of a percent matches a literal percent, on both instances
    expect(await ns(user.A, text("path", "INCLUDES", "%"))).toEqual([4]);
    expect(await ns(user.A, text("path", "INCLUDES", "%"), Y)).toEqual([5]);
    expect(await ns(user.A, text("path", "EQUALS", "/plain/x.mp4"))).toEqual([
      5,
    ]);
  });

  it("path never lists a scene the viewer hid, EXCLUDES and NOT_EQUALS included", async () => {
    expect(await ns(user.A, text("path", "STARTS_WITH", "/hidden/"))).toEqual([
      60,
    ]);
    for (const filter of [
      text("path", "STARTS_WITH", "/hidden/"),
      text("path", "INCLUDES", "hidden"),
      text("path", "EQUALS", "/hidden/x.mp4"),
    ]) {
      expect(await ns(user.B, filter)).toEqual([]);
    }
    expect(await ns(user.B, text("path", "EXCLUDES", "zzz"))).not.toContain(60);
    expect(await ns(user.B, text("path", "NOT_EQUALS", "zzz"))).not.toContain(
      60
    );
  });

  it("url matches any of the scene's URLs, not the JSON text", async () => {
    // The list's own quotes are never matched
    expect(await ns(user.A, text("url", "INCLUDES", '"'))).toEqual([]);
    expect(await ns(user.A, text("url", "INCLUDES", "]"))).toEqual([]);
    // The second URL holds it; the same id on y holds another
    expect(await ns(user.A, text("url", "INCLUDES", "example.com"))).toEqual([
      6,
    ]);
    expect(
      await ns(user.A, text("url", "INCLUDES", "nothing.test"), Y)
    ).toEqual([6]);
    expect(
      await ns(user.A, text("url", "EQUALS", "https://other.test/"))
    ).toEqual([7]);
    // NULL, '' and [] are all "no URL"
    const none = await ns(user.A, text("url", "IS_NULL"));
    expect(none).toEqual(expect.arrayContaining([8, 9, 10]));
    expect(none).not.toContain(6);
    expect(none).not.toContain(7);
    const some = await ns(user.A, text("url", "NOT_NULL"));
    expect(some).toEqual(expect.arrayContaining([6, 7, 60]));
    expect(some).not.toContain(8);
  });

  it("url never lists a scene the viewer hid, presence forms included", async () => {
    expect(await ns(user.A, text("url", "INCLUDES", "hidden.test"))).toEqual([
      60,
    ]);
    expect(await ns(user.B, text("url", "INCLUDES", "hidden.test"))).toEqual(
      []
    );
    expect(await ns(user.B, text("url", "NOT_NULL"))).not.toContain(60);
    expect(await ns(user.B, text("url", "IS_NULL"))).not.toContain(60);
    expect(await ns(user.B, text("url", "EXCLUDES", "zzz"))).not.toContain(60);
  });

  it("code matches the code, the underscore literally", async () => {
    expect(await ns(user.A, text("code", "INCLUDES", "B_1"))).toEqual([11]);
    expect(await ns(user.A, text("code", "EQUALS", "abx12"))).toEqual([12]);
    expect(await ns(user.A, text("code", "NOT_NULL"))).toEqual([11, 12]);
  });

  it("captions EQUALS en", async () => {
    expect(await ns(user.A, text("captions", "EQUALS", "en"))).toEqual([13]);
    // The same id on y holds German
    expect(await ns(user.A, text("captions", "EQUALS", "de"), Y)).toEqual([13]);
    expect(await ns(user.A, text("captions", "EQUALS", "de"))).toEqual([14]);
    // An element that is not an object holds no language code
    expect(await ns(user.A, text("captions", "EQUALS", "fr"))).toEqual([17]);
    const none = await ns(user.A, text("captions", "IS_NULL"));
    expect(none).toEqual(expect.arrayContaining([15, 16, 1, 2]));
    expect(none).not.toContain(13);
    expect(none).not.toContain(14);
    expect(none).not.toContain(17);
    const notEn = await ns(user.A, text("captions", "NOT_EQUALS", "en"));
    expect(notEn).toEqual(expect.arrayContaining([14, 15, 16, 17]));
    expect(notEn).not.toContain(13);
    expect(await ns(user.A, text("captions", "NOT_NULL"))).toEqual([
      13, 14, 17, 60,
    ]);
  });

  it("captions survive a damaged row", async () => {
    // Scene 16's captions are not JSON: every form runs and lists it as having none
    for (const modifier of ["EQUALS", "NOT_EQUALS"]) {
      await expect(
        listed(user.A, text("captions", modifier, "en"))
      ).resolves.toBeDefined();
    }
    expect(await ns(user.A, text("captions", "IS_NULL"))).toContain(16);
    expect(await ns(user.A, text("captions", "NOT_NULL"))).not.toContain(16);
  });

  it("captions never list a scene the viewer hid, negative and presence forms included", async () => {
    expect(await ns(user.A, text("captions", "EQUALS", "es"))).toEqual([60]);
    expect(await ns(user.B, text("captions", "EQUALS", "es"))).toEqual([]);
    expect(
      await ns(user.B, text("captions", "NOT_EQUALS", "en"))
    ).not.toContain(60);
    expect(await ns(user.B, text("captions", "NOT_NULL"))).not.toContain(60);
    expect(await ns(user.B, text("captions", "IS_NULL"))).not.toContain(60);
  });

  it("has markers counts visible live clips only", async () => {
    // 21's only clip is deleted, 22's only clip is hidden by B
    expect(await ns(user.A, { has_markers: true })).toEqual([20, 22, 23, 60]);
    expect(await ns(user.B, { has_markers: true })).toEqual([20, 23]);
    // A clip on y only lists that scene; x's scene 25 does not exist
    expect(await ns(user.A, { has_markers: true }, Y)).toEqual([25]);
    const without = await ns(user.B, { has_markers: false });
    expect(without).toEqual(expect.arrayContaining([21, 22, 24]));
    expect(without).not.toContain(20);
    expect(without).not.toContain(23);
    // The scene B hid is never listed, false included
    expect(without).not.toContain(60);
    expect(await ns(user.B, { has_markers: true })).not.toContain(60);
    expect(await ns(user.A, { has_markers: false }, Y)).toContain(20);
    expect(await ns(user.A, { has_markers: false }, Y)).not.toContain(25);
  });

  it("duplicated needs a visible twin", async () => {
    // Two scenes with phash p1 on x are listed; empty and NULL hashes never
    const yes = await ns(user.A, { duplicated: true });
    expect(yes).toEqual([30, 31, 32, 33, 60, 61]);
    // B hid 33 and 60: 32 and 61 lose their twins, and neither hidden scene lists
    expect(await ns(user.B, { duplicated: true })).toEqual([30, 31]);
    // Another instance's twin does not count (34@x and 34@y share p3)
    expect(yes).not.toContain(34);
    expect(await ns(user.A, { duplicated: true }, Y)).toEqual([]);
    // 38's only twin is deleted
    expect(yes).not.toContain(38);
  });

  it("duplicated false lists the rest, a NULL or empty phash included", async () => {
    const no = await ns(user.A, { duplicated: false });
    expect(no).toEqual(expect.arrayContaining([34, 35, 36, 37, 38, 1]));
    expect(no).not.toContain(30);
    expect(no).not.toContain(32);
    // True and false together are the library
    const all = await listed(user.A, {});
    const together = [
      ...(await listed(user.A, { duplicated: true })),
      ...(await listed(user.A, { duplicated: false })),
    ].sort();
    expect(together).toEqual(all);
    // B: 32 and 61 lost their twins; the scenes B hid are in neither list
    const noB = await ns(user.B, { duplicated: false });
    expect(noB).toEqual(expect.arrayContaining([32, 61, 34]));
    expect(noB).not.toContain(33);
    expect(noB).not.toContain(60);
    expect(await ns(user.A, { duplicated: false }, Y)).toContain(34);
  });

  it("groups at depth -1 include sub-collections", async () => {
    // Collection 10 contains 11
    expect(
      await ns(user.A, {
        groups: { value: [`10:${X}`], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([40, 41]);
    expect(
      await ns(user.A, {
        groups: { value: [`10:${X}`], modifier: "INCLUDES", depth: 0 },
      })
    ).toEqual([40]);
    // The instance stays: y's collection 11 is not under x's 10
    expect(
      await ns(
        user.A,
        { groups: { value: [`10:${X}`], modifier: "INCLUDES", depth: -1 } },
        Y
      )
    ).toEqual([]);
    // A bare id means every allowed instance, each with its own sub-collections
    expect(
      await ns(
        user.A,
        { groups: { value: ["11"], modifier: "INCLUDES", depth: -1 } },
        Y
      )
    ).toEqual([41]);
    // Excluding the parent at depth excludes the sub-collection's scenes too
    const rest = await ns(user.A, {
      groups: { value: [`10:${X}`], modifier: "EXCLUDES", depth: -1 },
    });
    expect(rest).not.toContain(40);
    expect(rest).not.toContain(41);
    expect(rest).toContain(42);
  });

  it("groups keep presence: has any and has none", async () => {
    const any = await ns(user.A, { groups: { modifier: "NOT_NULL" } });
    expect(any).toEqual([40, 41, 42]);
    const none = await ns(user.A, { groups: { modifier: "IS_NULL" } });
    expect(none).not.toContain(40);
    expect(none).toContain(1);
  });
});
