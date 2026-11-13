/**
 * A playlist's suggestions (POST /api/playlists/:id/suggestions, its count,
 * and the GET a 3.5.0-beta.3 tab still asks) against the replay fixture.
 *
 * The owner's playlist holds five scenes of the fixture's performer with
 * the most scenes, on the test instance; the performer's other scenes are
 * the strongest suggestions. The owner hides one of those, the recipient of
 * the shared playlist another: each is left out of its viewer's
 * suggestions only. A second playlist shows a tag past the tag budget
 * lifting the candidates that carry it. Every user, group and playlist here is deleted before
 * the file ends (playlists and hides go with their user).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  TAG_ROW_BUDGET,
  getPlaylistSuggestions,
} from "../../services/PlaylistSuggestionService.js";
import { must } from "../../tests/helpers/must.js";
import type {
  FindPlaylistSuggestionsRequest,
  FindPlaylistSuggestionsResponse,
  GetPlaylistSuggestionsResponse,
  ListCountResponse,
} from "../../types/api/index.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser, hideFor } from "../helpers/accessFixture.js";
import { expectRefused } from "../helpers/refused.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

const PREFIX = "plsugg_it_";
const PASSWORD = "plsugg_it_pass_1";
const GROUP_NAME = "plsugg-it-group";

type ApiUser = Awaited<ReturnType<typeof createApiUser>>;

let instanceId: string;
let owner: ApiUser;
let recipient: ApiUser;
let stranger: ApiUser;
let playlistId: number;
let emptyPlaylistId: number;
/** The performer's live scenes on the test instance, by id */
let performerScenes: string[];
let items: string[];
/** Hidden by the owner, and by the recipient */
let ownerHid: string;
let recipientHid: string;

async function removeRows(): Promise<void> {
  await prisma.userGroup.deleteMany({ where: { name: GROUP_NAME } });
  await prisma.user.deleteMany({
    where: { username: { startsWith: PREFIX } },
  });
}

/** The beta.3 bundle's GET: a page of 24 in the suggestions' order */
async function legacySuggestionsFor(
  user: ApiUser,
  id: number,
  query = ""
): Promise<{ status: number; data: GetPlaylistSuggestionsResponse }> {
  return user.client.get<GetPlaylistSuggestionsResponse>(
    `/api/playlists/${id}/suggestions${query}`
  );
}

/** The list's request; a page of 24 unless the body names its paging */
async function suggestionsFor(
  user: ApiUser,
  id: number,
  body: FindPlaylistSuggestionsRequest = {}
): Promise<{ status: number; data: FindPlaylistSuggestionsResponse }> {
  return user.client.post<FindPlaylistSuggestionsResponse>(
    `/api/playlists/${id}/suggestions`,
    { ...body, filter: { per_page: 24, ...body.filter } }
  );
}

async function countFor(
  user: ApiUser,
  id: number,
  body: FindPlaylistSuggestionsRequest = {}
): Promise<{ status: number; data: ListCountResponse }> {
  return user.client.post<ListCountResponse>(
    `/api/playlists/${id}/suggestions/count`,
    body
  );
}

const sceneIds = (data: { scenes: Array<{ id: string }> }) =>
  data.scenes.map((s) => s.id);

describe("Playlist suggestions (integration)", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await removeRows();
    instanceId = await findTestInstanceId();

    const rows = await prisma.scenePerformer.findMany({
      where: {
        performerId: TEST_ENTITIES.performerWithScenes,
        performerInstanceId: instanceId,
        sceneInstanceId: instanceId,
        scene: { deletedAt: null },
      },
      select: { sceneId: true },
    });
    performerScenes = rows
      .map((r) => r.sceneId)
      .sort((a, b) => Number(a) - Number(b));
    // Five in the playlist, two to hide, and some left to suggest
    expect(performerScenes.length).toBeGreaterThanOrEqual(9);
    items = performerScenes.slice(0, 5);
    ownerHid = performerScenes[5] ?? "";
    recipientHid = performerScenes[6] ?? "";

    owner = await createApiUser(`${PREFIX}owner`, PASSWORD);
    recipient = await createApiUser(`${PREFIX}recipient`, PASSWORD);
    stranger = await createApiUser(`${PREFIX}stranger`, PASSWORD);
    // A share counts only while its owner may share
    await prisma.user.update({
      where: { id: owner.id },
      data: { canShareOverride: true },
    });
    await hideFor(owner.id, "scene", ownerHid, instanceId);
    await hideFor(recipient.id, "scene", recipientHid, instanceId);

    playlistId = (
      await prisma.playlist.create({
        data: {
          userId: owner.id,
          name: "plsugg-it themed",
          items: {
            create: items.map((sceneId, position) => ({
              sceneId,
              instanceId,
              position,
            })),
          },
        },
      })
    ).id;
    emptyPlaylistId = (
      await prisma.playlist.create({
        data: { userId: owner.id, name: "plsugg-it empty" },
      })
    ).id;
    const group = await prisma.userGroup.create({
      data: {
        name: GROUP_NAME,
        members: { create: [{ userId: owner.id }, { userId: recipient.id }] },
      },
    });
    await prisma.playlistShare.create({
      data: { playlistId, groupId: group.id },
    });
  }, 60000);

  afterAll(async () => {
    await removeRows();
  }, 60000);

  it("suggests the other scenes of the performer the playlist shares first", async () => {
    const { status, data } = await suggestionsFor(owner, playlistId);
    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.perPage).toBe(24);

    const others = performerScenes.filter(
      (id) => !items.includes(id) && id !== ownerHid
    );
    expect(others.length).toBeLessThanOrEqual(data.perPage);
    expect(sceneIds(data).slice(0, others.length).sort()).toEqual(
      [...others].sort()
    );
    // Only from the instance its items are on
    expect(new Set(data.scenes.map((s) => s.instanceId))).toEqual(
      new Set([instanceId])
    );
    expect(data.count).toBeGreaterThanOrEqual(others.length);
  });

  it("never suggests a scene already in the playlist", async () => {
    const { data } = await suggestionsFor(owner, playlistId);
    expect(data.scenes.length).toBeGreaterThan(0);
    for (const id of items) {
      expect(sceneIds(data)).not.toContain(id);
    }
  });

  it("never suggests a scene the viewer hid", async () => {
    const { data } = await suggestionsFor(owner, playlistId);
    expect(sceneIds(data)).not.toContain(ownerHid);
    expect(sceneIds(data)).toContain(recipientHid);
  });

  it("gives a recipient of the shared playlist suggestions under their own exclusions", async () => {
    const { status, data } = await suggestionsFor(recipient, playlistId);
    expect(status).toBe(200);
    expect(sceneIds(data)).not.toContain(recipientHid);
    expect(sceneIds(data)).toContain(ownerHid);
    for (const id of items) {
      expect(sceneIds(data)).not.toContain(id);
    }
  });

  it("answers 404 to a user the playlist is not shared with", async () => {
    const { status } = await suggestionsFor(stranger, playlistId);
    expect(status).toBe(404);
  });

  it("answers 404 to the count for a user the playlist is not shared with", async () => {
    const { status } = await countFor(stranger, playlistId);
    expect(status).toBe(404);
  });

  it("answers 400 to a request naming its own scene ids", async () => {
    const ref = `${must(items[0])}:${instanceId}`;
    expectRefused(
      await owner.client.post(`/api/playlists/${playlistId}/suggestions`, {
        ids: [ref],
      }),
      ["ids"]
    );
    expectRefused(
      await owner.client.post(
        `/api/playlists/${playlistId}/suggestions/count`,
        { scene_filter: { ids: { value: [ref] } } }
      ),
      ["scene_filter.ids"]
    );
  });

  it("pages by the request's page size, and counts every suggestion", async () => {
    const all = await suggestionsFor(owner, playlistId, {
      filter: { per_page: 100 },
    });
    const total = must(all.data.count);
    expect(total).toBeGreaterThan(5);
    const first = await suggestionsFor(owner, playlistId, {
      filter: { per_page: 5 },
    });
    const second = await suggestionsFor(owner, playlistId, {
      filter: { per_page: 5, page: 2 },
    });
    expect(first.data.perPage).toBe(5);
    expect(first.data.count).toBe(total);
    expect(sceneIds(first.data)).toEqual(sceneIds(all.data).slice(0, 5));
    expect(sceneIds(second.data)).toEqual(sceneIds(all.data).slice(5, 10));
    expect((await countFor(owner, playlistId)).data.count).toBe(total);
  });

  it("lists in the suggestions' own order by default, the GET's order", async () => {
    const list = await suggestionsFor(owner, playlistId);
    const legacy = await legacySuggestionsFor(owner, playlistId);
    expect(legacy.status).toBe(200);
    expect(sceneIds(list.data)).toEqual(sceneIds(legacy.data));
    expect(list.data.count).toBe(legacy.data.count);
  });

  it("sorts the same suggestions by another scene sort", async () => {
    const byRank = await suggestionsFor(owner, playlistId, {
      filter: { per_page: 100 },
    });
    const byTitle = await suggestionsFor(owner, playlistId, {
      filter: { per_page: 100, sort: "title", direction: "ASC" },
    });
    expect(byTitle.status).toBe(200);
    expect([...sceneIds(byTitle.data)].sort()).toEqual(
      [...sceneIds(byRank.data)].sort()
    );
    // In the order of the stored sort key the scene list's title sort reads
    const keys = await prisma.stashScene.findMany({
      where: {
        stashInstanceId: instanceId,
        id: { in: sceneIds(byTitle.data) },
      },
      select: { id: true, titleSort: true },
    });
    const keyOf = new Map(keys.map((k) => [k.id, k.titleSort ?? ""]));
    const titles = sceneIds(byTitle.data).map((id) => keyOf.get(id) ?? "");
    for (let i = 1; i < titles.length; i++) {
      expect(must(titles[i - 1]) <= must(titles[i])).toBe(true);
    }
  });

  it("filters and counts within the suggestions only", async () => {
    const all = await suggestionsFor(owner, playlistId, {
      filter: { per_page: 100 },
    });
    const studios = await prisma.stashScene.findMany({
      where: { stashInstanceId: instanceId, id: { in: sceneIds(all.data) } },
      select: { id: true, studioId: true },
    });
    const studioId = must(studios.find((x) => x.studioId !== null)?.studioId);
    const expected = studios
      .filter((x) => x.studioId === studioId)
      .map((x) => x.id)
      .sort();
    const body: FindPlaylistSuggestionsRequest = {
      scene_filter: {
        studios: { value: [`${studioId}:${instanceId}`], modifier: "INCLUDES" },
      },
    };
    const filtered = await suggestionsFor(owner, playlistId, {
      ...body,
      filter: { per_page: 100 },
    });
    expect([...sceneIds(filtered.data)].sort()).toEqual(expected);
    expect(filtered.data.count).toBe(expected.length);
    expect((await countFor(owner, playlistId, body)).data.count).toBe(
      expected.length
    );
    // The studio's scenes outside the suggestions stay out (the items)
    for (const id of items) {
      expect(sceneIds(filtered.data)).not.toContain(id);
    }
  });

  it("answers 400 to a legacy page that is not a positive integer", async () => {
    for (const page of ["0", "-1", "abc", "1.5"]) {
      const { status } = await legacySuggestionsFor(
        owner,
        playlistId,
        `?page=${page}`
      );
      expect(status).toBe(400);
    }
  });

  it("a tag past the budget finds nothing but lifts the candidates that carry it", async () => {
    const tagRows = await prisma.sceneTag.findMany({
      where: { sceneInstanceId: instanceId, tagInstanceId: instanceId },
      select: { sceneId: true, tagId: true },
    });
    const tagsOf = (sceneId: string) =>
      tagRows.filter((r) => r.sceneId === sceneId).map((r) => r.tagId);
    // T: a tag at least 3 of the performer's scenes carry
    const tagged = (tagId: string) =>
      performerScenes.filter((id) => tagsOf(id).includes(tagId));
    const T = [...new Set(tagRows.map((r) => r.tagId))]
      .sort()
      .find((tagId) => tagged(tagId).length >= 3);
    expect(T).toBeDefined();
    const withT = tagged(T ?? "");
    const untagged = performerScenes.filter(
      (id) => tagsOf(id).length === 0 && id !== ownerHid && id !== recipientHid
    );
    const lifted = must(withT[2]);
    const scenes = await prisma.stashScene.findMany({
      where: { stashInstanceId: instanceId, deletedAt: null },
      select: { id: true, studioId: true, date: true },
    });
    const sceneOf = (id: string) => must(scenes.find((x) => x.id === id));
    // Two items carry T (support 2 of 5 keeps it), three carry no tag and
    // are not on `lifted`'s studio
    const liftItems = [
      must(withT[0]),
      must(withT[1]),
      ...untagged
        .filter((id) => sceneOf(id).studioId !== sceneOf(lifted).studioId)
        .slice(0, 3),
    ];
    const itemStudios = new Set(liftItems.map((id) => sceneOf(id).studioId));
    // Weighs what `lifted` weighs but for T, and comes first on the
    // tie-break (dated, where `lifted` has an older date or none)
    const plain = untagged
      .filter((id) => !liftItems.includes(id))
      .find(
        (id) =>
          !itemStudios.has(sceneOf(id).studioId) &&
          (sceneOf(id).date ?? "") > (sceneOf(lifted).date ?? "")
      );
    expect(plain).toBeDefined();
    // `lifted` shares the performer and T with the items, nothing else
    expect(itemStudios.has(sceneOf(lifted).studioId)).toBe(false);
    const itemTags = new Set(liftItems.flatMap(tagsOf));
    expect(tagsOf(lifted).filter((t) => itemTags.has(t))).toEqual([T]);
    // A scene T finds alone: not the performer's, no kept studio
    const tOnly = scenes.find(
      (x) =>
        tagsOf(x.id).includes(T ?? "") &&
        !performerScenes.includes(x.id) &&
        !itemStudios.has(x.studioId)
    )?.id;

    const liftPlaylist = await prisma.playlist.create({
      data: {
        userId: owner.id,
        name: "plsugg-it lift",
        items: {
          create: liftItems.map((sceneId, position) => ({
            sceneId,
            instanceId,
            position,
          })),
        },
      },
    });
    const run = async (tagRowBudget: number) =>
      (
        await getPlaylistSuggestions({
          userId: owner.id,
          playlistId: liftPlaylist.id,
          allowedInstanceIds: [instanceId],
          page: 1,
          perPage: 100,
          tagRowBudget,
        })
      ).scenes.map((x) => x.id);

    // Budget 0: T only boosts, so it finds no scene by itself
    const boosted = await run(0);
    expect(boosted.indexOf(lifted)).toBeGreaterThanOrEqual(0);
    expect(boosted.indexOf(lifted)).toBeLessThan(boosted.indexOf(plain ?? ""));
    // The full budget: T generates, and the order of what both find agrees
    const generated = await run(TAG_ROW_BUDGET);
    expect(generated.filter((id) => boosted.includes(id))).toEqual(boosted);
    expect(tOnly).toBeDefined();
    expect(generated).toContain(tOnly);
    expect(boosted).not.toContain(tOnly);
  });

  it("answers an empty playlist with no suggestions", async () => {
    const { status, data } = await suggestionsFor(owner, emptyPlaylistId);
    expect(status).toBe(200);
    expect(data).toEqual({ scenes: [], count: 0, page: 1, perPage: 24 });
    expect((await countFor(owner, emptyPlaylistId)).data).toEqual({
      count: 0,
    });
    const legacy = await legacySuggestionsFor(owner, emptyPlaylistId);
    expect(legacy.data).toEqual({ scenes: [], count: 0, page: 1, perPage: 24 });
  });
});
