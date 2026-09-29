/**
 * The image list's relations and instance, against the real test SQLite
 * database (QUERIES-17).
 *
 * Two made-up instances hold an image with the same id, 1, as two Stash
 * servers do, each with its own tag, performer and gallery (different ids)
 * and a studio of the same id, 7880001, with another name on each. Each
 * image lists only its own instance's relations, its studio included; the
 * relation loads are driven by the page's (id, instance) pairs. Every
 * seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type { ParsedListRequest } from "../../types/parsedFilters.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "ir-a";
const B = "ir-b";
const IMAGE = "1";
const ON_A = "7880001";
const ON_B = "7880002";
const STUDIO = "7880001";

/** No user owns per-user rows here, and exclusions are off */
async function list(overrides: Partial<ParsedListRequest<"image">> = {}) {
  const request = parsedListRequest("image", {
    filter: {
      ids: {
        refs: [{ id: IMAGE, instanceId: undefined }],
        modifier: "INCLUDES",
        depth: 0,
      },
    },
    ...overrides,
  });
  return imageQueryBuilder.execute({
    userId: 0,
    applyExclusions: false,
    allowedInstanceIds: [A, B],
    request,
  });
}

async function seed(): Promise<void> {
  const named = (id: string, instance: string, name: string) => ({
    id,
    stashInstanceId: instance,
    name,
  });
  await prisma.stashTag.createMany({
    data: [named(ON_A, A, "Tag on A"), named(ON_B, B, "Tag on B")],
  });
  await prisma.stashPerformer.createMany({
    data: [named(ON_A, A, "Performer on A"), named(ON_B, B, "Performer on B")],
  });
  await prisma.stashStudio.createMany({
    data: [named(STUDIO, A, "Studio on A"), named(STUDIO, B, "Studio on B")],
  });
  await prisma.stashGallery.createMany({
    data: [
      { id: ON_A, stashInstanceId: A, title: "Gallery on A" },
      { id: ON_B, stashInstanceId: B, title: "Gallery on B" },
    ],
  });
  await prisma.stashImage.createMany({
    data: [A, B].map((instance) => ({
      id: IMAGE,
      stashInstanceId: instance,
      title: `Image 1 on ${instance}`,
      studioId: STUDIO,
      studioInstanceId: instance,
    })),
  });
  const own = (instance: string) => (instance === A ? ON_A : ON_B);
  await prisma.imageTag.createMany({
    data: [A, B].map((instance) => ({
      imageId: IMAGE,
      imageInstanceId: instance,
      tagId: own(instance),
      tagInstanceId: instance,
    })),
  });
  await prisma.imagePerformer.createMany({
    data: [A, B].map((instance) => ({
      imageId: IMAGE,
      imageInstanceId: instance,
      performerId: own(instance),
      performerInstanceId: instance,
    })),
  });
  await prisma.imageGallery.createMany({
    data: [A, B].map((instance) => ({
      imageId: IMAGE,
      imageInstanceId: instance,
      galleryId: own(instance),
      galleryInstanceId: instance,
    })),
  });
}

/** The junction rows go with their images (ON DELETE CASCADE) */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashImage.deleteMany({ where });
  await prisma.stashGallery.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

describeWithDb("Image list relations by (id, instance) (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
  });

  afterAll(async () => {
    await removeRows();
  });

  const byInstance = async () => {
    const { items } = await list();
    return {
      a: must(
        items.find((i) => i.instanceId === A),
        "image 1 on ir-a"
      ),
      b: must(
        items.find((i) => i.instanceId === B),
        "image 1 on ir-b"
      ),
    };
  };

  it("each image lists only its own instance's tags and performers", async () => {
    const { a, b } = await byInstance();

    expect(a.tags.map((t) => [t.id, t.instanceId, t.name])).toEqual([
      [ON_A, A, "Tag on A"],
    ]);
    expect(b.tags.map((t) => [t.id, t.instanceId, t.name])).toEqual([
      [ON_B, B, "Tag on B"],
    ]);
    expect(a.performers.map((p) => [p.id, p.instanceId])).toEqual([[ON_A, A]]);
    expect(b.performers.map((p) => [p.id, p.instanceId])).toEqual([[ON_B, B]]);
  });

  it("each image lists its own galleries and its own instance's studio of the shared id", async () => {
    const { a, b } = await byInstance();

    expect(a.galleries.map((g) => [g.id, g.instanceId])).toEqual([[ON_A, A]]);
    expect(b.galleries.map((g) => [g.id, g.instanceId])).toEqual([[ON_B, B]]);
    expect(a.studio).toMatchObject({
      id: STUDIO,
      instanceId: A,
      name: "Studio on A",
    });
    expect(b.studio).toMatchObject({
      id: STUDIO,
      instanceId: B,
      name: "Studio on B",
    });
  });

  it("a detail page's instance reads that instance's image, with its relations", async () => {
    const { items, total } = await list({ specificInstanceId: B });

    expect(total).toBe(1);
    const image = must(items[0], "image 1 on ir-b");
    expect([image.id, image.instanceId]).toEqual([IMAGE, B]);
    expect(image.tags.map((t) => t.name)).toEqual(["Tag on B"]);
  });
});
