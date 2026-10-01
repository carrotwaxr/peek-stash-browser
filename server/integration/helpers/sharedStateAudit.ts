/**
 * Per-file check that the state every file shares comes out of a file as it
 * went in (L11), loaded as a setup file.
 *
 * Every file runs as the one shared admin (`TEST_ADMIN`), against one server
 * and one database. A file that leaves the admin's instance selection, hidden
 * items, restrictions, ratings, history, settings or saved lists changed, or
 * the configured instances, changes what the files after it see, so their
 * result depends on the order the files run in. This reads that state from
 * the database before the file and after it (setup-file hooks run before the
 * file's own `beforeAll` and after its own `afterAll`), and fails the file
 * that changed it, naming what changed. Restore in `afterAll`: the selection
 * through `restoreInstanceSelection` in `testClient.ts`; users, instances and
 * rows a file creates for itself are deleted by it.
 */
import { afterAll, beforeAll, expect } from "vitest";
import prisma from "../../prisma/singleton.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/** Columns that record when or under which key, not what */
const VOLATILE = new Set([
  "id",
  "userId",
  "createdAt",
  "updatedAt",
  "hiddenAt",
  "watchedAt",
]);

/** One table's rows as sorted JSON, without their volatile columns */
function rows(list: object[]): string[] {
  return list
    .map((row) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row).filter(([column]) => !VOLATILE.has(column))
        )
      )
    )
    .sort();
}

type Snapshot = Record<string, string[]>;

async function snapshot(): Promise<Snapshot> {
  const instances = rows(
    await prisma.stashInstance.findMany({
      select: { id: true, enabled: true },
    })
  );
  const admin = await prisma.user.findUnique({
    where: { username: TEST_ADMIN.username },
    select: {
      id: true,
      role: true,
      theme: true,
      preferredPreviewQuality: true,
      wallPlayback: true,
      unitPreference: true,
      lightboxDoubleTapAction: true,
      minimumPlayPercent: true,
      syncToStash: true,
      hideConfirmationDisabled: true,
      canShareOverride: true,
      canDownloadFilesOverride: true,
      canDownloadPlaylistsOverride: true,
      carouselPreferences: true,
      navPreferences: true,
      filterPresets: true,
      defaultFilterPresets: true,
      tableColumnDefaults: true,
      cardDisplaySettings: true,
      landingPagePreference: true,
    },
  });
  if (!admin) return { instances };
  const where = { userId: admin.id };
  return {
    instances,
    "the admin's settings": rows([admin]),
    "the admin's instance selection": rows(
      await prisma.userStashInstance.findMany({ where })
    ),
    "the admin's hidden items": rows(
      await prisma.userHiddenEntity.findMany({ where })
    ),
    "the admin's content restrictions": rows(
      await prisma.userContentRestriction.findMany({ where })
    ),
    "the admin's scene ratings": rows(
      await prisma.sceneRating.findMany({ where })
    ),
    "the admin's performer ratings": rows(
      await prisma.performerRating.findMany({ where })
    ),
    "the admin's studio ratings": rows(
      await prisma.studioRating.findMany({ where })
    ),
    "the admin's tag ratings": rows(await prisma.tagRating.findMany({ where })),
    "the admin's gallery ratings": rows(
      await prisma.galleryRating.findMany({ where })
    ),
    "the admin's group ratings": rows(
      await prisma.groupRating.findMany({ where })
    ),
    "the admin's image ratings": rows(
      await prisma.imageRating.findMany({ where })
    ),
    "the admin's watch history": rows(
      await prisma.watchHistory.findMany({ where })
    ),
    "the admin's image views": rows(
      await prisma.imageViewHistory.findMany({ where })
    ),
    "the admin's playlists": rows(await prisma.playlist.findMany({ where })),
    "the admin's carousels": rows(
      await prisma.userCarousel.findMany({ where })
    ),
    "the admin's group memberships": rows(
      await prisma.userGroupMembership.findMany({ where })
    ),
  };
}

let before: Snapshot = {};

beforeAll(async () => {
  before = await snapshot();
});

afterAll(async () => {
  const after = await snapshot();
  for (const what of new Set([...Object.keys(before), ...Object.keys(after)])) {
    expect(
      after[what] ?? [],
      `this file left ${what} changed; restore it in afterAll (see helpers/sharedStateAudit.ts)`
    ).toEqual(before[what] ?? []);
  }
});
