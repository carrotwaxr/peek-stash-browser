/**
 * Integration tests for the studio instance sync stores on galleries and
 * images (DB-05).
 *
 * A Stash gallery or image names its studio by id only, and that studio is on
 * the same Stash server, so the row's `studioInstanceId` is its own instance.
 * The studio cascade of a content restriction joins on that column: a wrong
 * one misses the studio's galleries and images, or matches another instance's
 * studio with the same id.
 *
 * The first test calls the batch writers directly with Stash-shaped rows under
 * two made-up instances that real sync never touches. The second reads what
 * global setup's startup sync stored.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  ENTITY_SYNC,
  type SyncEntityOf,
  type SyncRunContext,
} from "../../services/StashSyncService.js";
import { must } from "../../tests/helpers/must.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "studio-inst-it-a";
const B = "studio-inst-it-b";
const INSTANCES = [A, B];
const STUDIO_ID = "1";

/** Galleries and images as Stash's sync queries return them */
type SyncGallery = SyncEntityOf<"gallery">;
type SyncImage = SyncEntityOf<"image">;

function stashGallery(id: string, studioId: string | null): SyncGallery {
  return partialRow<SyncGallery>({
    id,
    title: `Gallery ${id}`,
    urls: [],
    organized: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    image_count: 1,
    studio: studioId ? partialRow({ id: studioId, name: "Root" }) : null,
    performers: [],
    tags: [],
    scenes: [],
    files: [],
    folder: null,
    cover: null,
  });
}

function stashImage(
  id: string,
  studioId: string | null,
  galleryId: string
): SyncImage {
  return partialRow<SyncImage>({
    id,
    title: `Image ${id}`,
    urls: [],
    organized: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    files: [],
    paths: {},
    galleries: [{ id: galleryId }],
    studio: studioId ? { id: studioId, name: "Root" } : null,
    tags: [],
    performers: [],
  });
}

/** Sync the same Stash rows onto one instance, as its sync would */
async function syncOnto(
  instanceId: string,
  galleries: SyncGallery[],
  images: SyncImage[]
): Promise<void> {
  const run: SyncRunContext = { signal: new AbortController().signal };
  await ENTITY_SYNC.gallery.processBatch(galleries, instanceId, run);
  await ENTITY_SYNC.image.processBatch(images, instanceId, run);
}

/** `<id>@<instance>` to its `studioId@studioInstanceId` */
async function studioRefs(
  table: "StashGallery" | "StashImage"
): Promise<Record<string, string>> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      stashInstanceId: string;
      studioId: string | null;
      studioInstanceId: string | null;
    }>
  >(
    `SELECT id, stashInstanceId, studioId, studioInstanceId FROM ${table}
     WHERE stashInstanceId IN (?, ?)`,
    A,
    B
  );
  return Object.fromEntries(
    rows.map((r) => [
      `${r.id}@${r.stashInstanceId}`,
      `${r.studioId ?? "null"}@${r.studioInstanceId ?? "null"}`,
    ])
  );
}

async function clearSeed(): Promise<void> {
  const inSeed = { in: INSTANCES };
  await prisma.imageGallery.deleteMany({ where: { imageInstanceId: inSeed } });
  await prisma.stashImage.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashGallery.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashStudio.deleteMany({ where: { stashInstanceId: inSeed } });
}

describeWithDb("StashSyncService studio instance (integration)", () => {
  beforeEach(async () => {
    await clearSeed();
    // The same studio id on both instances
    await prisma.stashStudio.createMany({
      data: INSTANCES.map((stashInstanceId) => ({
        id: STUDIO_ID,
        stashInstanceId,
        name: "Root",
      })),
    });
  });

  afterAll(async () => {
    await clearSeed();
  });

  it("images and galleries synced on a second instance point at that instance's studio", async () => {
    const galleries = [stashGallery("g1", STUDIO_ID), stashGallery("g2", null)];
    const images = [
      stashImage("i1", STUDIO_ID, "g1"),
      stashImage("i2", null, "g2"),
    ];
    await syncOnto(A, galleries, images);
    await syncOnto(B, galleries, images);

    expect(await studioRefs("StashGallery")).toEqual({
      [`g1@${A}`]: `1@${A}`,
      [`g2@${A}`]: "null@null",
      [`g1@${B}`]: `1@${B}`,
      [`g2@${B}`]: "null@null",
    });
    expect(await studioRefs("StashImage")).toEqual({
      [`i1@${A}`]: `1@${A}`,
      [`i2@${A}`]: "null@null",
      [`i1@${B}`]: `1@${B}`,
      [`i2@${B}`]: "null@null",
    });

    // A later sync moves the studio: the update path writes the column too
    await syncOnto(
      B,
      [stashGallery("g1", null), stashGallery("g2", STUDIO_ID)],
      [stashImage("i1", null, "g1"), stashImage("i2", STUDIO_ID, "g2")]
    );

    const galleriesAfter = await studioRefs("StashGallery");
    expect(galleriesAfter[`g1@${B}`]).toBe("null@null");
    expect(galleriesAfter[`g2@${B}`]).toBe(`1@${B}`);
    const imagesAfter = await studioRefs("StashImage");
    expect(imagesAfter[`i1@${B}`]).toBe("null@null");
    expect(imagesAfter[`i2@${B}`]).toBe(`1@${B}`);
  });

  it("every image and gallery the startup sync stored records its studio's instance", async () => {
    // Rows of the instances global setup synced (the seed above has none)
    const counts = await prisma.$queryRawUnsafe<
      Array<{ tbl: string; withStudio: bigint; wrong: bigint }>
    >(
      `SELECT 'gallery' AS tbl,
         count(*) FILTER (WHERE studioId IS NOT NULL) AS withStudio,
         count(*) FILTER (WHERE studioInstanceId IS NOT (CASE WHEN studioId IS NULL THEN NULL ELSE stashInstanceId END)) AS wrong
       FROM StashGallery WHERE stashInstanceId IN (SELECT id FROM StashInstance)
       UNION ALL
       SELECT 'image',
         count(*) FILTER (WHERE studioId IS NOT NULL),
         count(*) FILTER (WHERE studioInstanceId IS NOT (CASE WHEN studioId IS NULL THEN NULL ELSE stashInstanceId END))
       FROM StashImage WHERE stashInstanceId IN (SELECT id FROM StashInstance)`
    );
    const byTable = Object.fromEntries(counts.map((c) => [c.tbl, c]));

    // The fixture has galleries with a studio, and their images inherit it
    expect(Number(must(byTable.gallery).withStudio)).toBeGreaterThan(0);
    expect(Number(must(byTable.image).withStudio)).toBeGreaterThan(0);
    expect(Number(must(byTable.gallery).wrong)).toBe(0);
    expect(Number(must(byTable.image).wrong)).toBe(0);
  });
});
