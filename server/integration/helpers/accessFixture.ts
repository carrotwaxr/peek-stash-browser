/**
 * Seeded entities for the entity-access integration tests (item 6), reused
 * by the by-id read and download tests.
 *
 * Everything lives on three made-up instances, so the real sync never touches
 * it, and the 7-digit ids can't collide with a real test library. Rows are
 * written with prisma directly: POST /api/user/hidden-entities checks the
 * instance against the server's in-memory instance manager, which doesn't
 * know these instances.
 *
 * No recompute runs during these files: createUser doesn't trigger one. If a
 * scheduled sync's recomputeAllUsers fires mid-run, it rebuilds the hidden
 * rows from the seeded UserHiddenEntity rows.
 *
 * Every file that seeds calls clearAccessFixture() in afterAll. It also
 * deletes the fixture users, so a second run on the persisted
 * integration/test.db doesn't fail on a taken username.
 */
import prisma from "../../prisma/singleton.js";
import type { AccessEntityType } from "../../services/EntityAccessService.js";
import { TestClient, adminClient } from "./testClient.js";

export const FX = {
  A: "access-it-a",
  B: "access-it-b",
  OFF: "access-it-off",
} as const;

export const FX_ID = {
  SAME: "7700001", // all 8 types on A and on B (clip SAME is on A only, scene SAME@A)
  DELETED: "7700002", // scene on A, deletedAt set
  ON_OFF: "7700003", // scene on the disabled instance
  GLOBAL: "7700004", // scene on A and B; hidden for the user by a legacy global ("") row
  HIDDEN_A: "7700005", // performer, tag and image on A; hidden for the user on A
  VISIBLE_A: "7700006", // performer and tag on A
  B_ONLY: "7700007", // scene on B only, not hidden
  CLIP_OF_GLOBAL: "7700008", // clip on A whose scene is GLOBAL@A
} as const;

const FX_INSTANCES = [FX.A, FX.B, FX.OFF];
const inFixture = { in: FX_INSTANCES };

/** The seven types a user can hide; clips follow their scene. */
const HIDEABLE_TYPES = [
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
] as const;

/**
 * Deletes every User named access-it-* or access_it_* (their ratings,
 * history, hides and exclusions cascade), the fixture entities and
 * junctions, then the three StashInstance rows (UserStashInstance cascades).
 */
export async function clearAccessFixture(): Promise<void> {
  await prisma.user.deleteMany({
    where: {
      OR: [
        { username: { startsWith: "access-it-" } },
        { username: { startsWith: "access_it_" } },
      ],
    },
  });

  await prisma.imageGallery.deleteMany({
    where: { imageInstanceId: inFixture },
  });
  await prisma.performerTag.deleteMany({
    where: { performerInstanceId: inFixture },
  });
  await prisma.studioTag.deleteMany({
    where: { studioInstanceId: inFixture },
  });
  await prisma.groupTag.deleteMany({ where: { groupInstanceId: inFixture } });
  await prisma.stashClip.deleteMany({ where: { stashInstanceId: inFixture } });

  const where = { stashInstanceId: inFixture };
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.stashGallery.deleteMany({ where });
  await prisma.stashImage.deleteMany({ where });

  await prisma.userStashInstance.deleteMany({
    where: { instanceId: inFixture },
  });
  await prisma.stashInstance.deleteMany({ where: { id: inFixture } });
}

/** Clears first, then seeds the instances, entities and junctions. */
export async function seedAccessFixture(): Promise<void> {
  await clearAccessFixture();

  const { A, B, OFF } = FX;
  const {
    SAME,
    DELETED,
    ON_OFF,
    GLOBAL,
    HIDDEN_A,
    VISIBLE_A,
    B_ONLY,
    CLIP_OF_GLOBAL,
  } = FX_ID;

  const instances = [
    { id: A, enabled: true, priority: 900 },
    { id: B, enabled: true, priority: 901 },
    { id: OFF, enabled: false, priority: 902 },
  ];
  for (const inst of instances) {
    await prisma.stashInstance.create({
      data: {
        ...inst,
        name: inst.id,
        url: "http://127.0.0.1:9/graphql",
        apiKey: "fixture-key",
      },
    });
  }

  const label = (instanceId: string) =>
    instanceId === A ? "A" : instanceId === B ? "B" : "OFF";
  const scene = (
    id: string,
    stashInstanceId: string,
    extra: { fileSize?: bigint; deletedAt?: Date } = {}
  ) => ({
    id,
    stashInstanceId,
    title: `${label(stashInstanceId)}-${id}`,
    ...extra,
  });

  await prisma.stashScene.createMany({
    data: [
      scene(SAME, A, { fileSize: 100n }),
      scene(SAME, B, { fileSize: 1000n }),
      scene(DELETED, A, { deletedAt: new Date() }),
      scene(ON_OFF, OFF),
      scene(GLOBAL, A, { fileSize: 10n }),
      scene(GLOBAL, B, { fileSize: 20n }),
      scene(B_ONLY, B),
    ],
  });

  const named = (id: string, stashInstanceId: string) => ({
    id,
    stashInstanceId,
    name: `${label(stashInstanceId)}-${id}`,
  });
  const titled = (id: string, stashInstanceId: string) => ({
    id,
    stashInstanceId,
    title: `${label(stashInstanceId)}-${id}`,
  });

  await prisma.stashPerformer.createMany({
    data: [
      named(SAME, A),
      named(SAME, B),
      named(HIDDEN_A, A),
      named(VISIBLE_A, A),
    ],
  });
  await prisma.stashStudio.createMany({
    data: [named(SAME, A), named(SAME, B)],
  });
  await prisma.stashTag.createMany({
    data: [
      named(SAME, A),
      named(SAME, B),
      named(HIDDEN_A, A),
      named(VISIBLE_A, A),
    ],
  });
  await prisma.stashGroup.createMany({
    data: [named(SAME, A), named(SAME, B)],
  });
  await prisma.stashGallery.createMany({
    data: [titled(SAME, A), titled(SAME, B)],
  });
  await prisma.stashImage.createMany({
    data: [titled(SAME, A), titled(SAME, B), titled(HIDDEN_A, A)],
  });

  await prisma.stashClip.createMany({
    data: [
      {
        id: SAME,
        stashInstanceId: A,
        sceneId: SAME,
        sceneInstanceId: A,
        seconds: 1,
      },
      {
        id: CLIP_OF_GLOBAL,
        stashInstanceId: A,
        sceneId: GLOBAL,
        sceneInstanceId: A,
        seconds: 1,
      },
    ],
  });

  await prisma.imageGallery.createMany({
    data: [
      {
        imageId: SAME,
        imageInstanceId: A,
        galleryId: SAME,
        galleryInstanceId: A,
      },
      {
        imageId: HIDDEN_A,
        imageInstanceId: A,
        galleryId: SAME,
        galleryInstanceId: A,
      },
      {
        imageId: SAME,
        imageInstanceId: B,
        galleryId: SAME,
        galleryInstanceId: B,
      },
    ],
  });
  const performerTag = (performerId: string, tagId: string) => ({
    performerId,
    performerInstanceId: A,
    tagId,
    tagInstanceId: A,
  });
  await prisma.performerTag.createMany({
    data: [
      performerTag(VISIBLE_A, SAME),
      performerTag(HIDDEN_A, SAME),
      performerTag(VISIBLE_A, HIDDEN_A),
      performerTag(VISIBLE_A, VISIBLE_A),
    ],
  });
  await prisma.studioTag.createMany({
    data: [HIDDEN_A, VISIBLE_A].map((tagId) => ({
      studioId: SAME,
      studioInstanceId: A,
      tagId,
      tagInstanceId: A,
    })),
  });
  await prisma.groupTag.createMany({
    data: [HIDDEN_A, VISIBLE_A].map((tagId) => ({
      groupId: SAME,
      groupInstanceId: A,
      tagId,
      tagInstanceId: A,
    })),
  });
}

/**
 * Upserts a UserHiddenEntity row and its UserExcludedEntity row (reason
 * "hidden"). instanceId "" writes a legacy global row.
 */
export async function hideFor(
  userId: number,
  entityType: AccessEntityType,
  entityId: string,
  instanceId: string
): Promise<void> {
  const key = { userId, entityType, entityId, instanceId };
  await prisma.userHiddenEntity.upsert({
    where: { userId_entityType_entityId_instanceId: key },
    create: key,
    update: {},
  });
  await prisma.userExcludedEntity.upsert({
    where: { userId_entityType_entityId_instanceId: key },
    create: { ...key, reason: "hidden" },
    update: { reason: "hidden" },
  });
}

/**
 * The default hides: SAME@B for the seven hideable types, the GLOBAL scene
 * with a legacy "" row, and HIDDEN_A's performer, tag and image on A.
 */
export async function hideFixtureDefaults(userId: number): Promise<void> {
  for (const entityType of HIDEABLE_TYPES) {
    await hideFor(userId, entityType, FX_ID.SAME, FX.B);
  }
  await hideFor(userId, "scene", FX_ID.GLOBAL, "");
  for (const entityType of ["performer", "tag", "image"] as const) {
    await hideFor(userId, entityType, FX_ID.HIDDEN_A, FX.A);
  }
}

/**
 * Creates a USER through the admin API (or finds it in GET /api/user/all if
 * it already exists), then logs a new TestClient in as that user.
 * adminClient must already be logged in.
 */
export async function createApiUser(
  username: string,
  password: string
): Promise<{ id: number; client: TestClient }> {
  const created = await adminClient.post<{ user?: { id: number } }>(
    "/api/user/create",
    { username, password, role: "USER" }
  );
  let id = created.ok ? created.data.user?.id : undefined;
  if (id === undefined) {
    const all = await adminClient.get<{
      users?: Array<{ id: number; username: string }>;
    }>("/api/user/all");
    id = all.data.users?.find((u) => u.username === username)?.id;
  }
  if (id === undefined) {
    throw new Error(
      `Failed to create or find user ${username}: ${created.status} ${JSON.stringify(created.data)}`
    );
  }

  const client = new TestClient();
  await client.login(username, password);
  return { id, client };
}
