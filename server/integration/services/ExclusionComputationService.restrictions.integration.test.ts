/**
 * Integration tests for the restriction model (item 13) against the real
 * test SQLite database: INCLUDE/EXCLUDE pairs, restrictEmpty, tag and studio
 * descendants, gallery/image/clip cascades, per-instance empty rows and the
 * admin policy, plus the list endpoints that read the computed rows.
 *
 * Every row is seeded under two made-up instances (restr-it-a, restr-it-b)
 * with the same ids on both, so cross-instance leaks show up as extra rows.
 * The two StashInstance rows go in through prisma (the setup route tests the
 * connection); getUserAllowedInstanceIds and the builders read them from the
 * database, so the server on :9999 sees them without a reload.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { userHiddenEntityService } from "../../services/UserHiddenEntityService.js";
import { defaultRestrictEmpty } from "../../services/exclusionPolicy.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { TestClient, adminClient } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "restr-it-a";
const B = "restr-it-b";
const INSTANCES = [A, B];
const USER_NAME = "restr_it_user";
const ADMIN_NAME = "restr_it_admin";
const PASSWORD = "restr_it_password_1";

type Reason = "restricted" | "cascade" | "hidden" | "empty";

/** `${entityId}@${instanceId}:${reason}` keys for one instance and reason. */
function K(instanceId: string, reason: Reason, ...ids: string[]): string[] {
  return ids.map((id) => `${id}@${instanceId}:${reason}`);
}

async function rows(userId: number, entityType: string) {
  return prisma.userExcludedEntity.findMany({
    where: { userId, entityType },
    select: { entityId: true, instanceId: true, reason: true },
  });
}

/** Assert the exact set of keys for one entity type. */
async function expectRows(
  userId: number,
  entityType: string,
  expected: string[]
) {
  const actual = await rows(userId, entityType);
  expect(
    new Set(actual.map((r) => `${r.entityId}@${r.instanceId}:${r.reason}`))
  ).toEqual(new Set(expected));
}

/** No restriction-derived row may carry an empty instance (Rule 8). */
async function expectNoGlobalRows(userId: number) {
  const global = await prisma.userExcludedEntity.findMany({
    where: {
      userId,
      instanceId: "",
      reason: { in: ["restricted", "cascade", "empty"] },
    },
  });
  expect(global).toEqual([]);
}

interface RuleInput {
  entityType: "groups" | "tags" | "studios" | "galleries";
  mode: "INCLUDE" | "EXCLUDE";
  entityIds: string[];
  restrictEmpty?: boolean;
}

async function setRules(userId: number, rules: RuleInput[]) {
  await prisma.userContentRestriction.deleteMany({ where: { userId } });
  await prisma.userContentRestriction.createMany({
    data: rules.map((r) => ({
      userId,
      entityType: r.entityType,
      mode: r.mode,
      entityIds: JSON.stringify(r.entityIds),
      restrictEmpty: r.restrictEmpty ?? defaultRestrictEmpty(r.mode),
    })),
  });
}

async function recompute(userId: number) {
  await exclusionComputationService.recomputeForUser(userId);
}

async function clearSeed(): Promise<void> {
  const inA = { in: INSTANCES };
  await prisma.sceneTag.deleteMany({ where: { sceneInstanceId: inA } });
  await prisma.scenePerformer.deleteMany({ where: { sceneInstanceId: inA } });
  await prisma.sceneGallery.deleteMany({ where: { sceneInstanceId: inA } });
  await prisma.imageGallery.deleteMany({ where: { imageInstanceId: inA } });
  await prisma.imageTag.deleteMany({ where: { imageInstanceId: inA } });
  await prisma.galleryTag.deleteMany({ where: { galleryInstanceId: inA } });
  await prisma.performerTag.deleteMany({
    where: { performerInstanceId: inA },
  });
  await prisma.clipTag.deleteMany({ where: { clipInstanceId: inA } });
  await prisma.stashClip.deleteMany({ where: { stashInstanceId: inA } });
  await prisma.stashScene.deleteMany({ where: { stashInstanceId: inA } });
  await prisma.stashImage.deleteMany({ where: { stashInstanceId: inA } });
  await prisma.stashGallery.deleteMany({ where: { stashInstanceId: inA } });
  await prisma.stashPerformer.deleteMany({ where: { stashInstanceId: inA } });
  await prisma.stashStudio.deleteMany({ where: { stashInstanceId: inA } });
  await prisma.stashTag.deleteMany({ where: { stashInstanceId: inA } });
  await prisma.userStashInstance.deleteMany({ where: { instanceId: inA } });
  await prisma.stashInstance.deleteMany({ where: { id: inA } });
}

async function seed(): Promise<void> {
  await prisma.stashInstance.createMany({
    data: INSTANCES.map((id) => ({
      id,
      name: id,
      url: `http://${id}.invalid/graphql`,
      apiKey: "x",
      enabled: true,
    })),
  });

  // Tags: 4 Anime under 1 Cartoons, 5 Hardcore under 2 Explicit, 6 Deep under 4
  await prisma.stashTag.createMany({
    data: [
      { id: "1", stashInstanceId: A, name: "Cartoons" },
      { id: "2", stashInstanceId: A, name: "Explicit" },
      { id: "3", stashInstanceId: A, name: "Other" },
      { id: "4", stashInstanceId: A, name: "Anime", parentIds: '["1"]' },
      { id: "5", stashInstanceId: A, name: "Hardcore", parentIds: '["2"]' },
      { id: "6", stashInstanceId: A, name: "Deep", parentIds: '["4"]' },
      { id: "1", stashInstanceId: B, name: "Cartoons" },
      { id: "2", stashInstanceId: B, name: "Explicit" },
      { id: "3", stashInstanceId: B, name: "Other" },
      { id: "4", stashInstanceId: B, name: "Anime", parentIds: '["1"]' },
    ],
  });

  // Studios: 3 Sub under 1 Root
  await prisma.stashStudio.createMany({
    data: [
      { id: "1", stashInstanceId: A, name: "Root" },
      { id: "2", stashInstanceId: A, name: "Other" },
      { id: "3", stashInstanceId: A, name: "Sub", parentId: "1" },
      { id: "1", stashInstanceId: B, name: "Root" },
      { id: "3", stashInstanceId: B, name: "Sub", parentId: "1" },
    ],
  });

  await prisma.stashPerformer.createMany({
    data: [
      { id: "p1", stashInstanceId: A, name: "P1" },
      { id: "p2", stashInstanceId: A, name: "P2" },
      { id: "p2", stashInstanceId: B, name: "P2" },
    ],
  });

  await prisma.stashGallery.createMany({
    data: [
      { id: "g1", stashInstanceId: A, studioId: "1", studioInstanceId: A },
      { id: "g2", stashInstanceId: A },
      { id: "g3", stashInstanceId: A },
      { id: "g4", stashInstanceId: A },
      { id: "g1", stashInstanceId: B },
    ],
  });

  await prisma.stashImage.createMany({
    data: [
      { id: "i1", stashInstanceId: A },
      { id: "i2", stashInstanceId: A },
      { id: "i3", stashInstanceId: A },
      { id: "i4", stashInstanceId: A },
      { id: "i5", stashInstanceId: A },
      { id: "i6", stashInstanceId: A },
      { id: "i7", stashInstanceId: A, studioId: "1", studioInstanceId: A },
      { id: "i1", stashInstanceId: B },
    ],
  });

  await prisma.stashScene.createMany({
    data: [
      { id: "s1", stashInstanceId: A, studioId: "1" },
      { id: "s2", stashInstanceId: A },
      { id: "s3", stashInstanceId: A, studioId: "2" },
      { id: "s4", stashInstanceId: A },
      { id: "s5", stashInstanceId: A, inheritedTagIds: '["1"]' },
      { id: "s6", stashInstanceId: A },
      { id: "s7", stashInstanceId: A },
      { id: "s8", stashInstanceId: A },
      { id: "s9", stashInstanceId: A },
      { id: "s10", stashInstanceId: A, studioId: "3" },
      { id: "s1", stashInstanceId: B, studioId: "1" },
      { id: "s8", stashInstanceId: B, studioId: "3" },
    ],
  });

  await prisma.stashClip.createMany({
    data: [
      { id: "c1", primaryTagId: "2", sceneId: "s1" },
      { id: "c2", primaryTagId: "1", sceneId: "s1" },
      { id: "c3", primaryTagId: "1", sceneId: "s3" },
      { id: "c4", primaryTagId: "5", sceneId: "s1" },
    ].map((c) => ({
      id: c.id,
      stashInstanceId: A,
      sceneId: c.sceneId,
      sceneInstanceId: A,
      primaryTagId: c.primaryTagId,
      primaryTagInstanceId: A,
      seconds: 1,
      isGenerated: true,
    })),
  });

  const sceneTags: Array<[string, string, string]> = [
    ["s1", "1", A],
    ["s2", "1", A],
    ["s2", "2", A],
    ["s3", "3", A],
    ["s6", "2", A],
    ["s8", "4", A],
    ["s9", "5", A],
    ["s10", "6", A],
    ["s1", "1", B],
    ["s8", "4", B],
  ];
  await prisma.sceneTag.createMany({
    data: sceneTags.map(([sceneId, tagId, inst]) => ({
      sceneId,
      sceneInstanceId: inst,
      tagId,
      tagInstanceId: inst,
    })),
  });

  await prisma.scenePerformer.createMany({
    data: [
      { sceneId: "s1", performerId: "p1", inst: A },
      { sceneId: "s4", performerId: "p2", inst: A },
      { sceneId: "s1", performerId: "p2", inst: B },
    ].map((r) => ({
      sceneId: r.sceneId,
      sceneInstanceId: r.inst,
      performerId: r.performerId,
      performerInstanceId: r.inst,
    })),
  });

  await prisma.performerTag.createMany({
    data: [
      {
        performerId: "p1",
        performerInstanceId: A,
        tagId: "2",
        tagInstanceId: A,
      },
    ],
  });

  await prisma.sceneGallery.createMany({
    data: [
      {
        sceneId: "s7",
        sceneInstanceId: A,
        galleryId: "g1",
        galleryInstanceId: A,
      },
    ],
  });

  const galleryTags: Array<[string, string, string]> = [
    ["g1", "1", A],
    ["g2", "2", A],
    ["g4", "4", A],
    ["g1", "3", B],
  ];
  await prisma.galleryTag.createMany({
    data: galleryTags.map(([galleryId, tagId, inst]) => ({
      galleryId,
      galleryInstanceId: inst,
      tagId,
      tagInstanceId: inst,
    })),
  });

  const imageGalleries: Array<[string, string, string]> = [
    ["i1", "g1", A],
    ["i2", "g2", A],
    ["i5", "g3", A],
    ["i6", "g4", A],
    ["i7", "g1", A],
    ["i1", "g1", B],
  ];
  await prisma.imageGallery.createMany({
    data: imageGalleries.map(([imageId, galleryId, inst]) => ({
      imageId,
      imageInstanceId: inst,
      galleryId,
      galleryInstanceId: inst,
    })),
  });

  const imageTags: Array<[string, string]> = [
    ["i2", "2"],
    ["i3", "3"],
    ["i4", "6"],
    ["i6", "4"],
    ["i7", "1"],
  ];
  await prisma.imageTag.createMany({
    data: imageTags.map(([imageId, tagId]) => ({
      imageId,
      imageInstanceId: A,
      tagId,
      tagInstanceId: A,
    })),
  });
}

async function createUser(username: string, role: "USER" | "ADMIN") {
  const response = await adminClient.post<{
    success: boolean;
    user: { id: number };
  }>("/api/user/create", { username, password: PASSWORD, role });
  if (!response.ok) {
    throw new Error(
      `Failed to create ${username}: ${response.status} ${JSON.stringify(response.data)}`
    );
  }
  return response.data.user.id;
}

/** The rules of the include+exclude test, reused by the HTTP test. */
const INCLUDE_PLUS_EXCLUDE: RuleInput[] = [
  { entityType: "tags", mode: "INCLUDE", entityIds: [`1:${A}`] },
  { entityType: "tags", mode: "EXCLUDE", entityIds: [`2:${A}`] },
];

describeWithDb("ExclusionComputationService restrictions (integration)", () => {
  let userId: number;
  let adminId: number;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);

    // Leftovers from an interrupted run
    await prisma.user.deleteMany({
      where: { username: { in: [USER_NAME, ADMIN_NAME] } },
    });
    await clearSeed();
    await seed();

    userId = await createUser(USER_NAME, "USER");
    adminId = await createUser(ADMIN_NAME, "ADMIN");
    await prisma.userStashInstance.createMany({
      data: [userId, adminId].flatMap((id) =>
        INSTANCES.map((instanceId) => ({ userId: id, instanceId }))
      ),
    });
  }, 120000);

  beforeEach(async () => {
    await prisma.userContentRestriction.deleteMany({
      where: { userId: { in: [userId, adminId] } },
    });
    await prisma.userHiddenEntity.deleteMany({
      where: { userId: { in: [userId, adminId] } },
    });
  });

  afterAll(async () => {
    for (const id of [userId, adminId]) {
      if (id) await adminClient.delete(`/api/user/${id}`);
    }
    await prisma.user.deleteMany({
      where: { username: { in: [USER_NAME, ADMIN_NAME] } },
    });
    await clearSeed();
  }, 120000);

  it("INCLUDE tags [Cartoons@A], restrictEmpty on: descendants admitted, not inverted", async () => {
    await setRules(userId, [
      { entityType: "tags", mode: "INCLUDE", entityIds: [`1:${A}`] },
    ]);
    await recompute(userId);

    await expectRows(userId, "scene", [
      ...K(A, "restricted", "s3", "s4", "s6", "s7", "s9"),
      ...K(B, "restricted", "s1", "s8"),
    ]);
    await expectRows(userId, "tag", [
      ...K(A, "restricted", "2", "3", "5"),
      ...K(B, "restricted", "1", "2", "3", "4"),
    ]);
    await expectRows(userId, "gallery", [
      ...K(A, "restricted", "g2", "g3"),
      ...K(B, "restricted", "g1"),
    ]);
    await expectRows(userId, "image", [
      ...K(A, "restricted", "i1", "i2", "i3", "i5"),
      ...K(B, "restricted", "i1"),
    ]);
    await expectRows(userId, "performer", [
      ...K(A, "empty", "p2"),
      ...K(B, "empty", "p2"),
    ]);
    await expectRows(userId, "studio", [
      ...K(A, "empty", "2"),
      ...K(B, "empty", "1", "3"),
    ]);
    await expectNoGlobalRows(userId);
  }, 60000);

  it("per-instance rows follow the instance's own content", async () => {
    await setRules(userId, [
      {
        entityType: "tags",
        mode: "INCLUDE",
        entityIds: [`1:${A}`, `1:${B}`],
      },
    ]);
    await recompute(userId);

    await expectRows(userId, "scene", [
      ...K(A, "restricted", "s3", "s4", "s6", "s7", "s9"),
    ]);
    await expectRows(userId, "tag", [
      ...K(A, "restricted", "2", "3", "5"),
      ...K(B, "restricted", "2", "3"),
    ]);
    await expectRows(userId, "performer", [...K(A, "empty", "p2")]);
    await expectRows(userId, "studio", [...K(A, "empty", "2")]);
    await expectNoGlobalRows(userId);
  }, 60000);

  it("INCLUDE tags [Cartoons@A], restrictEmpty off", async () => {
    await setRules(userId, [
      {
        entityType: "tags",
        mode: "INCLUDE",
        entityIds: [`1:${A}`],
        restrictEmpty: false,
      },
    ]);
    await recompute(userId);

    await expectRows(userId, "scene", [
      ...K(A, "restricted", "s3", "s6", "s9"),
      ...K(B, "restricted", "s1", "s8"),
    ]);
    await expectRows(userId, "gallery", [
      ...K(A, "restricted", "g2"),
      ...K(B, "restricted", "g1"),
    ]);
    await expectRows(userId, "image", [...K(A, "restricted", "i2", "i3")]);
    await expectRows(userId, "performer", [...K(B, "empty", "p2")]);
    await expectNoGlobalRows(userId);
  }, 60000);

  it("INCLUDE [Cartoons@A] + EXCLUDE [Explicit@A]: exclude wins and covers Hardcore", async () => {
    await setRules(userId, INCLUDE_PLUS_EXCLUDE);
    await recompute(userId);

    await expectRows(userId, "scene", [
      ...K(A, "cascade", "s2", "s6", "s9"),
      ...K(A, "restricted", "s3", "s4", "s7"),
      ...K(B, "restricted", "s1", "s8"),
    ]);
    await expectRows(userId, "tag", [
      ...K(A, "restricted", "2", "3", "5"),
      ...K(B, "restricted", "1", "2", "3", "4"),
    ]);
    await expectRows(userId, "performer", [
      ...K(A, "cascade", "p1"),
      ...K(A, "empty", "p2"),
      ...K(B, "empty", "p2"),
    ]);
    await expectRows(userId, "clip", [...K(A, "cascade", "c1", "c4")]);
    await expectRows(userId, "gallery", [
      ...K(A, "cascade", "g2"),
      ...K(A, "restricted", "g3"),
      ...K(B, "restricted", "g1"),
    ]);
    await expectRows(userId, "image", [
      ...K(A, "cascade", "i2"),
      ...K(A, "restricted", "i1", "i3", "i5"),
      ...K(B, "restricted", "i1"),
    ]);
    await expectRows(userId, "studio", [
      ...K(A, "empty", "2"),
      ...K(B, "empty", "1", "3"),
    ]);
    await expectNoGlobalRows(userId);
  }, 60000);

  it("EXCLUDE tags [Explicit@A] alone, restrictEmpty on", async () => {
    await setRules(userId, [
      {
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: [`2:${A}`],
        restrictEmpty: true,
      },
    ]);
    await recompute(userId);

    await expectRows(userId, "scene", [
      ...K(A, "cascade", "s2", "s6", "s9"),
      ...K(A, "restricted", "s4", "s7"),
    ]);
    await expectRows(userId, "tag", [
      ...K(A, "restricted", "2", "5"),
      ...K(B, "empty", "2"),
    ]);
    await expectRows(userId, "gallery", [
      ...K(A, "cascade", "g2"),
      ...K(A, "restricted", "g3"),
      ...K(B, "empty", "g1"),
    ]);
    await expectRows(userId, "image", [
      ...K(A, "cascade", "i2"),
      ...K(A, "restricted", "i1", "i5"),
      ...K(B, "restricted", "i1"),
    ]);
    await expectRows(userId, "performer", [
      ...K(A, "cascade", "p1"),
      ...K(A, "empty", "p2"),
    ]);
    await expectRows(userId, "clip", [...K(A, "cascade", "c1", "c4")]);
    await expectNoGlobalRows(userId);
  }, 60000);

  it("EXCLUDE tags [Cartoons@A] hides the whole subtree but not the parent's siblings", async () => {
    await setRules(userId, [
      {
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: [`1:${A}`],
        restrictEmpty: false,
      },
    ]);
    await recompute(userId);

    await expectRows(userId, "tag", [
      ...K(A, "restricted", "1", "4", "6"),
      ...K(B, "empty", "2"),
    ]);
    await expectRows(userId, "scene", [
      ...K(A, "cascade", "s1", "s2", "s5", "s8", "s10"),
    ]);
    await expectRows(userId, "gallery", [...K(A, "cascade", "g1", "g4")]);
    await expectRows(userId, "image", [...K(A, "cascade", "i4", "i6", "i7")]);
    await expectRows(userId, "clip", [...K(A, "cascade", "c2", "c3")]);
    await expectRows(userId, "performer", [...K(A, "empty", "p1")]);
    await expectRows(userId, "studio", [...K(A, "empty", "1", "3")]);
    await expectNoGlobalRows(userId);
  }, 60000);

  it("INCLUDE studios [Root@A], restrictEmpty on: Sub admitted", async () => {
    await setRules(userId, [
      { entityType: "studios", mode: "INCLUDE", entityIds: [`1:${A}`] },
    ]);
    await recompute(userId);

    await expectRows(userId, "scene", [
      ...K(A, "restricted", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"),
      ...K(B, "restricted", "s1", "s8"),
    ]);
    await expectRows(userId, "studio", [
      ...K(A, "restricted", "2"),
      ...K(B, "restricted", "1", "3"),
    ]);
    await expectRows(userId, "gallery", [
      ...K(A, "restricted", "g2", "g3", "g4"),
      ...K(B, "restricted", "g1"),
    ]);
    await expectRows(userId, "image", [
      ...K(A, "restricted", "i1", "i2", "i3", "i4", "i5", "i6"),
      ...K(B, "restricted", "i1"),
    ]);
    await expectRows(userId, "tag", [
      ...K(A, "empty", "3", "5"),
      ...K(B, "empty", "2", "3", "4"),
    ]);
    await expectNoGlobalRows(userId);
  }, 60000);

  it("EXCLUDE studios [Root@A] covers Sub on A only", async () => {
    await setRules(userId, [
      { entityType: "studios", mode: "EXCLUDE", entityIds: [`1:${A}`] },
    ]);
    await recompute(userId);

    await expectRows(userId, "studio", [...K(A, "restricted", "1", "3")]);
    await expectRows(userId, "scene", [...K(A, "cascade", "s1", "s10")]);
    await expectRows(userId, "gallery", [...K(A, "cascade", "g1")]);
    await expectRows(userId, "image", [...K(A, "cascade", "i7")]);
    await expectNoGlobalRows(userId);
  }, 60000);

  it("galleries EXCLUDE [g1@A]", async () => {
    await setRules(userId, [
      { entityType: "galleries", mode: "EXCLUDE", entityIds: [`g1:${A}`] },
    ]);
    await recompute(userId);

    await expectRows(userId, "gallery", [...K(A, "restricted", "g1")]);
    await expectRows(userId, "scene", [...K(A, "cascade", "s7")]);
    await expectRows(userId, "image", [...K(A, "cascade", "i1", "i7")]);
    await expectNoGlobalRows(userId);
  }, 60000);

  it("a parent tag is exempt from the empty phase only through a child on its own instance", async () => {
    await userHiddenEntityService.hideEntity(userId, "scene", "s1", B);
    await userHiddenEntityService.hideEntity(userId, "scene", "s8", B);
    await recompute(userId);

    await expectRows(userId, "tag", [...K(B, "empty", "2", "4")]);
  }, 60000);

  it("empty tags count gallery and image tags", async () => {
    await userHiddenEntityService.hideEntity(userId, "scene", "s3", A);
    await recompute(userId);
    let tagRows = await rows(userId, "tag");
    expect(
      tagRows.some(
        (r) => r.entityId === "3" && r.instanceId === A && r.reason === "empty"
      )
    ).toBe(false);

    await userHiddenEntityService.hideEntity(userId, "image", "i3", A);
    await recompute(userId);
    tagRows = await rows(userId, "tag");
    expect(
      tagRows.some(
        (r) => r.entityId === "3" && r.instanceId === A && r.reason === "empty"
      )
    ).toBe(true);
  }, 60000);

  it("a hide never masks a restriction, and own hides never look like one", async () => {
    await setRules(userId, [
      {
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: [`2:${A}`],
        restrictEmpty: true,
      },
    ]);
    const hides: Array<[string, string]> = [
      ["tag", "2"], // restricted directly
      ["performer", "p1"], // restricted through the cascade from tag 2
      ["scene", "s4"], // restricted by the content rule (no tag)
      ["performer", "p2"], // empty for the user: its one scene is s4
      ["studio", "1"], // visible
      ["scene", "s1"], // visible; in hidden studio 1, with hidden performer p1
      ["gallery", "g1"], // visible; its image i7 is a cascade of the studio hide
    ];
    await prisma.userHiddenEntity.createMany({
      data: hides.map(([entityType, entityId]) => ({
        userId,
        entityType,
        entityId,
        instanceId: A,
      })),
    });
    await recompute(userId);

    const reasons = new Map(
      (
        await prisma.userExcludedEntity.findMany({
          where: { userId, instanceId: A },
          select: { entityType: true, entityId: true, reason: true },
        })
      ).map((r) => [`${r.entityType}:${r.entityId}`, r.reason])
    );
    expect({
      tag2: reasons.get("tag:2"),
      p1: reasons.get("performer:p1"),
      s4: reasons.get("scene:s4"),
      p2: reasons.get("performer:p2"),
      studio1: reasons.get("studio:1"),
      studio3: reasons.get("studio:3"),
      s1: reasons.get("scene:s1"),
      g1: reasons.get("gallery:g1"),
    }).toEqual({
      tag2: "restricted",
      p1: "cascade",
      s4: "restricted",
      p2: "empty",
      studio1: "hidden",
      studio3: "hidden",
      s1: "hidden",
      g1: "hidden",
    });

    const listed = await userHiddenEntityService.getHiddenEntities(userId);
    const byKey = new Map(
      listed.map((item) => [`${item.entityType}:${item.entityId}`, item])
    );
    expect(byKey.size).toBe(hides.length);
    for (const key of ["tag:2", "performer:p1", "scene:s4", "performer:p2"]) {
      expect(byKey.get(key)).toMatchObject({
        instanceId: A,
        restricted: true,
        entity: null,
      });
    }
    for (const key of ["studio:1", "scene:s1", "gallery:g1"]) {
      expect(byKey.get(key)).toMatchObject({
        instanceId: A,
        restricted: false,
      });
      expect(byKey.get(key)?.entity).not.toBeNull();
    }
    expect(byKey.get("studio:1")?.entity).toMatchObject({ name: "Root" });
  }, 60000);

  it("hiding a restricted entity keeps its restriction reason", async () => {
    await setRules(userId, [
      { entityType: "tags", mode: "EXCLUDE", entityIds: [`2:${A}`] },
    ]);
    await recompute(userId);

    // The service writes whatever it is given; the controller checks access
    await userHiddenEntityService.hideEntity(userId, "tag", "2", A);

    const tagRows = await rows(userId, "tag");
    expect(
      tagRows
        .filter((r) => r.instanceId === A)
        .map((r) => `${r.entityId}:${r.reason}`)
        .sort()
    ).toEqual(["2:restricted", "5:restricted"]);

    const listed = await userHiddenEntityService.getHiddenEntities(userId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      entityType: "tag",
      entityId: "2",
      instanceId: A,
      restricted: true,
      entity: null,
    });
  }, 60000);

  it("admin: same rules, hides only", async () => {
    await setRules(adminId, [
      { entityType: "tags", mode: "INCLUDE", entityIds: [`1:${A}`] },
    ]);
    await userHiddenEntityService.hideEntity(adminId, "tag", "2", A);
    await recompute(adminId);

    const all = await prisma.userExcludedEntity.findMany({
      where: { userId: adminId },
      select: {
        entityType: true,
        entityId: true,
        instanceId: true,
        reason: true,
      },
    });
    expect(
      new Set(
        all.map(
          (r) => `${r.entityType}:${r.entityId}@${r.instanceId}:${r.reason}`
        )
      )
    ).toEqual(
      new Set([
        `tag:2@${A}:hidden`,
        `tag:5@${A}:hidden`,
        `scene:s2@${A}:cascade`,
        `scene:s6@${A}:cascade`,
        `scene:s9@${A}:cascade`,
        `performer:p1@${A}:cascade`,
        `gallery:g2@${A}:cascade`,
        `image:i2@${A}:cascade`,
        `clip:c1@${A}:cascade`,
        `clip:c4@${A}:cascade`,
      ])
    );

    // Restrictions never apply to an admin, so their own hide lists in full
    const listed = await userHiddenEntityService.getHiddenEntities(adminId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      entityType: "tag",
      entityId: "2",
      instanceId: A,
      restricted: false,
    });
    expect(listed[0].entity).toMatchObject({ name: "Explicit" });

    await userHiddenEntityService.unhideEntity(adminId, "tag", "2", A);
    // unhide queues a background recompute; let it start, then coalesce with it
    await new Promise((resolve) => setImmediate(resolve));
    await recompute(adminId);

    expect(
      await prisma.userExcludedEntity.count({ where: { userId: adminId } })
    ).toBe(0);
  }, 60000);

  it("list endpoints as the restricted user", async () => {
    await setRules(userId, INCLUDE_PLUS_EXCLUDE);
    await recompute(userId);

    const userClient = new TestClient();
    await userClient.login(USER_NAME, PASSWORD);
    // Builders emit instanceId; the image rows keep the raw stashInstanceId
    const keyOf = (e: {
      id: string;
      instanceId?: string;
      stashInstanceId?: string;
    }) => `${e.id}@${e.instanceId ?? e.stashInstanceId}`;

    const scenes = await userClient.post<{
      findScenes: { scenes: Array<{ id: string; instanceId: string }> };
    }>("/api/library/scenes", { filter: { per_page: 100 } });
    expect(scenes.ok).toBe(true);
    expect(new Set(scenes.data.findScenes.scenes.map(keyOf))).toEqual(
      new Set([`s1@${A}`, `s5@${A}`, `s8@${A}`, `s10@${A}`])
    );

    const galleries = await userClient.post<{
      findGalleries: { galleries: Array<{ id: string; instanceId: string }> };
    }>("/api/library/galleries", { filter: { per_page: 100 } });
    expect(galleries.ok).toBe(true);
    expect(new Set(galleries.data.findGalleries.galleries.map(keyOf))).toEqual(
      new Set([`g1@${A}`, `g4@${A}`])
    );

    const images = await userClient.post<{
      findImages: { images: Array<{ id: string; stashInstanceId: string }> };
    }>("/api/library/images", { filter: { per_page: 100 } });
    expect(images.ok).toBe(true);
    expect(new Set(images.data.findImages.images.map(keyOf))).toEqual(
      new Set([`i4@${A}`, `i6@${A}`, `i7@${A}`])
    );

    // The clips list is scoped by its instanceId param, not by the user's
    // instances, and its rows carry no instance field: ask for A directly.
    const clips = await userClient.get<{ clips: Array<{ id: string }> }>(
      `/api/clips?perPage=100&instanceId=${A}`
    );
    expect(clips.ok).toBe(true);
    expect(new Set(clips.data.clips.map((c) => c.id))).toEqual(new Set(["c2"]));

    const tags = await userClient.post<{
      findTags: { tags: Array<{ id: string; instanceId: string }> };
    }>("/api/library/tags", { filter: { per_page: 100 } });
    expect(tags.ok).toBe(true);
    expect(new Set(tags.data.findTags.tags.map(keyOf))).toEqual(
      new Set([`1@${A}`, `4@${A}`, `6@${A}`])
    );

    const performers = await userClient.post<{
      findPerformers: {
        performers: Array<{ id: string; instanceId: string }>;
      };
    }>("/api/library/performers", { filter: { per_page: 100 } });
    expect(performers.ok).toBe(true);
    const performerKeys = new Set(
      performers.data.findPerformers.performers.map(keyOf)
    );
    expect(performerKeys.has(`p1@${A}`)).toBe(false);
    expect(performerKeys.has(`p2@${A}`)).toBe(false);
    expect(performerKeys.has(`p2@${B}`)).toBe(false);
  }, 60000);

  it("list endpoints as the admin with a hidden studio", async () => {
    await userHiddenEntityService.hideEntity(adminId, "studio", "1", A);

    const client = new TestClient();
    await client.login(ADMIN_NAME, PASSWORD);
    // Builders emit instanceId; the image rows keep the raw stashInstanceId
    const keyOf = (e: {
      id: string;
      instanceId?: string;
      stashInstanceId?: string;
    }) => `${e.id}@${e.instanceId ?? e.stashInstanceId}`;

    const studios = await client.post<{
      findStudios: { studios: Array<{ id: string; instanceId: string }> };
    }>("/api/library/studios", { filter: { per_page: 100 } });
    expect(studios.ok).toBe(true);
    const studioKeys = new Set(studios.data.findStudios.studios.map(keyOf));
    expect(studioKeys.has(`1@${A}`)).toBe(false);
    expect(studioKeys.has(`3@${A}`)).toBe(false);
    expect(studioKeys.has(`3@${B}`)).toBe(true);

    const scenes = await client.post<{
      findScenes: { scenes: Array<{ id: string; instanceId: string }> };
    }>("/api/library/scenes", { filter: { per_page: 100 } });
    expect(scenes.ok).toBe(true);
    const sceneKeys = new Set(scenes.data.findScenes.scenes.map(keyOf));
    expect(sceneKeys.has(`s1@${A}`)).toBe(false);
    expect(sceneKeys.has(`s10@${A}`)).toBe(false);
    expect(sceneKeys.has(`s2@${A}`)).toBe(true);
  }, 60000);
});
