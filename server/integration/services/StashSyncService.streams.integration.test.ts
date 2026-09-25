/**
 * Integration tests for the scene stream choices sync stores (item 1).
 *
 * Stash's sceneStreams URLs carry the Stash API key. Sync keeps only Stash's
 * decisions (Direct, MKV, the resolution tiers) in three small columns.
 *
 * Rows are seeded under an isolated stashInstanceId that real sync never
 * touches, and the scene spec's batch writer (ENTITY_SYNC.scene.processBatch)
 * is called directly with a Stash-shaped scene, so no Stash server is
 * involved.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  ENTITY_SYNC,
  type SyncEntityOf,
} from "../../services/StashSyncService.js";
import { must } from "../../tests/helpers/must.js";
import { untrusted } from "../../tests/helpers/untrusted.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const TEST_INSTANCE = "streams-it-instance";
const SCENE_ID = "9001";

/** A scene as Stash's compact scene query returns it */
type SyncScene = SyncEntityOf<"scene">;

const scene: SyncScene = {
  id: SCENE_ID,
  title: "Streams IT",
  code: null,
  date: null,
  details: null,
  director: null,
  organized: false,
  rating100: null,
  o_counter: 0,
  play_count: 0,
  play_duration: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  urls: [],
  studio: null,
  performers: [],
  tags: [],
  groups: [],
  galleries: [],
  files: [
    {
      path: "/v/streams-it.avi",
      basename: "streams-it.avi",
      duration: 60,
      width: 720,
      height: 404,
      video_codec: "mpeg4",
      audio_codec: "aac",
      bit_rate: 1000000,
      frame_rate: 30,
      size: 1000,
      format: "avi",
      fingerprints: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
  ],
  paths: {
    screenshot: "/scene/9001/screenshot?t=1",
    preview: null,
    sprite: null,
    vtt: null,
    webp: null,
    caption: null,
  },
  captions: [],
  // The url field, which the query does not ask for, proves a URL is ignored
  // even if Stash sends one.
  sceneStreams: [
    untrusted({
      label: "Direct stream",
      url: "http://stash.test/scene/9001/stream?apikey=IT-SECRET",
    }),
    { label: "MP4" },
    { label: "MP4 Low (240p)" },
    { label: "WEBM" },
    { label: "WEBM Low (240p)" },
    { label: "HLS" },
    { label: "HLS Low (240p)" },
    { label: "DASH" },
    { label: "DASH Low (240p)" },
  ],
};

async function syncScene(): Promise<void> {
  await ENTITY_SYNC.scene.processBatch([scene], TEST_INSTANCE, {
    signal: new AbortController().signal,
  });
}

async function readRow(): Promise<Record<string, unknown>> {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    "SELECT * FROM StashScene WHERE id = ? AND stashInstanceId = ?",
    SCENE_ID,
    TEST_INSTANCE
  );
  expect(rows).toHaveLength(1);
  return must(rows[0]);
}

async function clearTestScenes(): Promise<void> {
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
}

describeWithDb("StashSyncService scene stream choices (integration)", () => {
  beforeEach(async () => {
    await clearTestScenes();
  });

  afterAll(async () => {
    await clearTestScenes();
  });

  it("stores Stash's stream choices and no URL or key", async () => {
    await syncScene();

    const row = await readRow();
    const json = JSON.stringify(row, (_k, v: unknown) =>
      typeof v === "bigint" ? String(v) : v
    );
    expect(json).not.toContain("IT-SECRET");
    // SQLite stores 1 and 0; Prisma's raw queries return BOOLEAN columns as
    // true and false.
    expect(Number(row.streamDirect)).toBe(1);
    expect(Number(row.streamMkv)).toBe(0);
    expect(row.streamResolutions).toBe("ORIGINAL,LOW");
  });
});
