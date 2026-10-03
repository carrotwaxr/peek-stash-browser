/**
 * `/api/user/filter-pins` (pinned fields and filters per list, W8).
 *
 * A throwaway user's PUT, GET and DELETE round trip; two saves at once keep
 * both lists (the compare-and-set write); the raw write leaves `updatedAt`
 * in the form Prisma reads; another user's pins are never visible; deleting
 * the user leaves nothing of theirs; and the shared-state audit lists the
 * column.
 */
import * as fs from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import {
  type TestClient,
  adminClient,
  findTestInstanceId,
  guestClient,
} from "../helpers/testClient.js";

interface ListPins {
  fields: string[];
  filters: Array<{
    id: string;
    key: string;
    state: Record<string, unknown>;
    label?: string;
  }>;
}
type Pins = Record<string, ListPins>;

let SCENE_PINS: ListPins;

describe("filter pins (integration)", () => {
  let user: { id: number; client: TestClient };
  let other: { id: number; client: TestClient };
  /** The throwaway users still to delete */
  const toDelete = new Set<number>();

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    const instanceId = await findTestInstanceId();
    SCENE_PINS = {
      fields: ["rating"],
      filters: [
        {
          id: "0123456789abcdef0123456789abcdef",
          key: "tagIds",
          state: {
            tagIds: [`${TEST_ENTITIES.tagWithEntities}:${instanceId}`],
            tagIdsModifier: "INCLUDES",
          },
          label: "A tag",
        },
      ],
    };
    user = await createApiUser("filter_pins_it_user", "filter_pins_it_pass_1");
    toDelete.add(user.id);
    other = await createApiUser(
      "filter_pins_it_other",
      "filter_pins_it_pass_2"
    );
    toDelete.add(other.id);
  }, 60000);

  afterAll(async () => {
    for (const id of toDelete) await adminClient.delete(`/api/user/${id}`);
  }, 60000);

  const storedText = async (userId: number) => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ pins: string | null; kind: string }>
    >(
      `SELECT CAST(filterPins AS TEXT) AS pins, typeof(updatedAt) AS kind FROM "User" WHERE id = ?`,
      userId
    );
    return must(rows[0], "the user row");
  };

  it("shows the defaults before anything is saved", async () => {
    const response = await user.client.get<{ pins: Pins }>(
      "/api/user/filter-pins"
    );
    expect(response.status).toBe(200);
    expect(Object.keys(response.data.pins).sort()).toEqual([
      "clip",
      "gallery",
      "group",
      "image",
      "performer",
      "scene",
      "studio",
      "tag",
    ]);
    expect(
      must(response.data.pins.scene).filters.map((filter) => filter.id)
    ).toEqual(["default-unwatched", "default-favorites"]);
    expect((await storedText(user.id)).pins).toBeNull();
  });

  it("round trips a PUT, a GET and a DELETE", async () => {
    const put = await user.client.put<{ pins: ListPins }>(
      "/api/user/filter-pins/scene",
      SCENE_PINS
    );
    expect(put.status, JSON.stringify(put.data)).toBe(200);
    expect(put.data.pins).toEqual(SCENE_PINS);

    const got = await user.client.get<{ pins: Pins }>("/api/user/filter-pins");
    expect(got.data.pins.scene).toEqual(SCENE_PINS);
    // the other lists still show their defaults
    expect(
      must(got.data.pins.performer).filters.map((filter) => filter.key)
    ).toEqual(["favorite"]);

    const reset = await user.client.delete<{ pins: ListPins }>(
      "/api/user/filter-pins/scene"
    );
    expect(reset.status).toBe(200);
    expect(reset.data.pins.filters.map((filter) => filter.id)).toEqual([
      "default-unwatched",
      "default-favorites",
    ]);
    const after = await user.client.get<{ pins: Pins }>(
      "/api/user/filter-pins"
    );
    expect(after.data.pins.scene).toEqual(reset.data.pins);
    expect((await storedText(user.id)).pins).toBeNull();
  });

  it("keeps a list saved empty empty", async () => {
    const put = await user.client.put("/api/user/filter-pins/performer", {
      fields: [],
      filters: [],
    });
    expect(put.status).toBe(200);
    const got = await user.client.get<{ pins: Pins }>("/api/user/filter-pins");
    expect(got.data.pins.performer).toEqual({ fields: [], filters: [] });
    await user.client.delete("/api/user/filter-pins/performer");
  });

  it("keeps both lists when two saves arrive together", async () => {
    const tagPins: ListPins = { fields: ["rating"], filters: [] };
    const [scene, tag] = await Promise.all([
      user.client.put("/api/user/filter-pins/scene", SCENE_PINS),
      user.client.put("/api/user/filter-pins/tag", tagPins),
    ]);
    expect(scene.status).toBe(200);
    expect(tag.status).toBe(200);
    const got = await user.client.get<{ pins: Pins }>("/api/user/filter-pins");
    expect(got.data.pins.scene).toEqual(SCENE_PINS);
    expect(got.data.pins.tag).toEqual(tagPins);
  });

  it("stores updatedAt as Prisma does, so prisma.user reads it", async () => {
    const stored = await storedText(user.id);
    expect(stored.kind).toBe("integer");
    const read = await prisma.user.findUnique({
      where: { id: user.id },
      select: { updatedAt: true, filterPins: true },
    });
    const updatedAt = must(read).updatedAt;
    expect(updatedAt).toBeInstanceOf(Date);
    expect(Math.abs(Date.now() - updatedAt.getTime())).toBeLessThan(60_000);
    // Prisma's own read of the raw-written column
    expect(must(read).filterPins).toMatchObject({ scene: SCENE_PINS });
  });

  it("a stored value that is not JSON: a PUT answers 409 and keeps it, the reset writes NULL over it", async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "filterPins" = ? WHERE "id" = ?`,
      "{not json",
      user.id
    );

    const put = await user.client.put<{ error: string }>(
      "/api/user/filter-pins/scene",
      SCENE_PINS
    );
    expect(put.status).toBe(409);
    expect(put.data.error).toBe(
      "Your saved pinned filters can't be read, so nothing was saved"
    );
    expect((await storedText(user.id)).pins).toBe("{not json");

    const reset = await user.client.delete("/api/user/filter-pins/scene");
    expect(reset.status).toBe(200);
    expect((await storedText(user.id)).pins).toBeNull();

    // Saving works again (and the pins stay for the tests that follow)
    const again = await user.client.put(
      "/api/user/filter-pins/scene",
      SCENE_PINS
    );
    expect(again.status).toBe(200);
  });

  it("refuses invalid pins with their paths, and a list that is no list", async () => {
    const bad = await user.client.put<{
      issues?: Array<{ path: string; message: string }>;
    }>("/api/user/filter-pins/scene", {
      fields: ["nope"],
      filters: [{ id: "x", key: "tagIds", state: { tagIds: ["5"] } }],
    });
    expect(bad.status).toBe(400);
    expect(bad.data.issues?.map((issue) => issue.path)).toEqual([
      "fields[0]",
      "filters[0].state.tagIds[0]",
    ]);
    const list = await user.client.put("/api/user/filter-pins/playlist", {
      fields: [],
      filters: [],
    });
    expect(list.status).toBe(400);
    expect(
      (await user.client.delete("/api/user/filter-pins/nope")).status
    ).toBe(400);
  });

  it("never shows another user's pins", async () => {
    const got = await other.client.get<{ pins: Pins }>("/api/user/filter-pins");
    expect(got.data.pins.scene).not.toEqual(SCENE_PINS);
    expect(
      must(got.data.pins.scene).filters.map((filter) => filter.id)
    ).toEqual(["default-unwatched", "default-favorites"]);
    expect((await storedText(other.id)).pins).toBeNull();
  });

  it("needs a signed-in user", async () => {
    const response = await guestClient.get("/api/user/filter-pins");
    expect(response.status).toBe(401);
  });

  it("is gone with the user: no row holds their pins", async () => {
    expect((await storedText(user.id)).pins).not.toBeNull();
    const deleted = await adminClient.delete(`/api/user/${user.id}`);
    expect(deleted.status).toBe(200);
    toDelete.delete(user.id);
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
      `SELECT COUNT(*) AS n FROM "User" WHERE id = ? OR (filterPins IS NOT NULL AND CAST(filterPins AS TEXT) LIKE ?)`,
      user.id,
      `%${SCENE_PINS.filters[0]?.id ?? ""}%`
    );
    expect(Number(must(rows[0]).n)).toBe(0);
  });

  it("is listed in the shared-state audit", () => {
    const audit = fs.readFileSync(
      new URL("../helpers/sharedStateAudit.ts", import.meta.url),
      "utf8"
    );
    expect(audit).toMatch(/^\s+filterPins: true,$/m);
  });
});
