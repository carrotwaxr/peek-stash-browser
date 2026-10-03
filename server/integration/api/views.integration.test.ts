/**
 * Views (9b, W6): `/api/user/filter-presets` with Save as new, Save changes
 * (PUT), Rename (PATCH), Set as default and Delete, for a throwaway user.
 *
 * A View's filters are validated on save and its bare ids tied to their one
 * instance (the replay's two libraries share ids, so a bare id stays bare);
 * names are unique per list; deleting a View clears every default naming it;
 * another user never sees them (invariant 6).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import { expectRefused } from "../helpers/refused.js";
import {
  type TestClient,
  adminClient,
  findTestInstanceId,
} from "../helpers/testClient.js";

interface View {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  sort: string;
  direction: string;
  viewMode?: string;
  perPage?: number | null;
  createdAt: string;
  updatedAt?: string;
}
interface SavedResponse {
  success: true;
  preset: View;
}
type Presets = Record<string, View[] | undefined>;

describe("Views (integration)", () => {
  let user: { id: number; client: TestClient };
  let other: { id: number; client: TestClient };
  let tagRef = "";
  /** The throwaway users still to delete */
  const toDelete = new Set<number>();

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    tagRef = `${TEST_ENTITIES.tagWithEntities}:${await findTestInstanceId()}`;
    user = await createApiUser("views_it_user", "views_it_pass_1");
    toDelete.add(user.id);
    other = await createApiUser("views_it_other", "views_it_pass_2");
    toDelete.add(other.id);
  }, 60000);

  afterAll(async () => {
    for (const id of toDelete) await adminClient.delete(`/api/user/${id}`);
  }, 60000);

  const presetsOf = async (client: TestClient) =>
    (await client.get<{ presets: Presets }>("/api/user/filter-presets")).data
      .presets;
  const defaultsOf = async (client: TestClient) =>
    (
      await client.get<{ defaults: Record<string, string> }>(
        "/api/user/default-presets"
      )
    ).data.defaults;

  it("round trips save, overwrite, rename, set default and delete", async () => {
    // Save as new: prefixed rows and a group; a bare id both libraries hold stays bare
    const saved = await user.client.post<SavedResponse>(
      "/api/user/filter-presets",
      {
        artifactType: "scene",
        name: "Item 64",
        filters: {
          tagIds: [tagRef],
          "2.tagIds": [TEST_ENTITIES.tagWithEntities],
          g1: "any",
          "g1.favorite": "true",
          "g1.rating": { min: "3" },
        },
        sort: "created_at",
        direction: "DESC",
      }
    );
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    const view = saved.data.preset;
    expect(view.filters).toEqual({
      tagIds: [tagRef],
      "2.tagIds": [TEST_ENTITIES.tagWithEntities],
      g1: "any",
      "g1.favorite": "true",
      "g1.rating": { min: "3" },
    });
    expect((await presetsOf(user.client)).scene).toEqual([view]);

    // A second View of that name in another case is refused
    const duplicate = await user.client.post("/api/user/filter-presets", {
      artifactType: "scene",
      name: "  item 64 ",
      filters: {},
      sort: "created_at",
      direction: "DESC",
    });
    expect(duplicate.status).toBe(409);

    // Save changes: filters, sort and presentation; id, name and createdAt stay
    const overwritten = await user.client.put<SavedResponse>(
      `/api/user/filter-presets/scene/${view.id}`,
      {
        filters: { tagIds: [tagRef], tagIdsModifier: "INCLUDES_ALL" },
        sort: "recommended",
        direction: "asc",
        viewMode: "wall",
        perPage: 48,
      }
    );
    expect(overwritten.status, JSON.stringify(overwritten.data)).toBe(200);
    expect(overwritten.data.preset).toMatchObject({
      id: view.id,
      name: "Item 64",
      createdAt: view.createdAt,
      filters: { tagIds: [tagRef], tagIdsModifier: "INCLUDES_ALL" },
      sort: "recommended",
      direction: "ASC",
      viewMode: "wall",
      perPage: 48,
    });
    expect(typeof overwritten.data.preset.updatedAt).toBe("string");

    // Rename
    const renamed = await user.client.patch<SavedResponse>(
      `/api/user/filter-presets/scene/${view.id}`,
      { name: "Two tag rows" }
    );
    expect(renamed.status).toBe(200);
    expect(renamed.data.preset.name).toBe("Two tag rows");

    // Set as default on the performer pages' Scenes tab
    const setDefault = await user.client.put("/api/user/default-preset", {
      context: "scene_performer",
      presetId: view.id,
    });
    expect(setDefault.status).toBe(200);
    expect(await defaultsOf(user.client)).toEqual({
      scene_performer: view.id,
    });

    const stored = must((await presetsOf(user.client)).scene)[0];
    expect(stored).toEqual({
      ...overwritten.data.preset,
      name: "Two tag rows",
      updatedAt: renamed.data.preset.updatedAt,
    });

    // Delete clears the default naming it
    const deleted = await user.client.delete(
      `/api/user/filter-presets/scene/${view.id}`
    );
    expect(deleted.status).toBe(200);
    expect((await presetsOf(user.client)).scene).toEqual([]);
    expect(await defaultsOf(user.client)).toEqual({});
  });

  it("refuses invalid filters with their paths, and a missing View with 404", async () => {
    const bad = await user.client.post("/api/user/filter-presets", {
      artifactType: "scene",
      name: "Bad",
      filters: { notAFilter: 1, "g1.tags": { value: [tagRef] } },
      sort: "created_at",
      direction: "DESC",
    });
    expectRefused(bad, ["filters.notAFilter", "filters.g1.tags"]);

    const missing = await user.client.put(
      "/api/user/filter-presets/scene/not-a-view",
      { filters: {}, sort: "created_at", direction: "DESC" }
    );
    expect(missing.status).toBe(404);
    const missingRename = await user.client.patch(
      "/api/user/filter-presets/scene/not-a-view",
      { name: "x" }
    );
    expect(missingRename.status).toBe(404);
  });

  it("another user's GET never sees them", async () => {
    const saved = await user.client.post<SavedResponse>(
      "/api/user/filter-presets",
      {
        artifactType: "performer",
        context: "performer",
        name: "Fave Ladies",
        filters: { gender: "FEMALE" },
        sort: "name",
        direction: "ASC",
        setAsDefault: true,
      }
    );
    expect(saved.status).toBe(200);
    expect(saved.data.preset.filters).toEqual({ gender: ["FEMALE"] });

    const theirs = await presetsOf(other.client);
    expect(JSON.stringify(theirs)).not.toContain(saved.data.preset.id);
    expect(await defaultsOf(other.client)).toEqual({});

    // nor can they change or delete it
    const overwrite = await other.client.put(
      `/api/user/filter-presets/performer/${saved.data.preset.id}`,
      { filters: {}, sort: "name", direction: "ASC" }
    );
    expect(overwrite.status).toBe(404);
    await other.client.delete(
      `/api/user/filter-presets/performer/${saved.data.preset.id}`
    );
    expect(must((await presetsOf(user.client)).performer)).toHaveLength(1);
  });
});
