/**
 * Data migration 012 against the replay: a user's custom carousels are stored
 * as trees, a saved View is canonical, and a default naming a View the user no
 * longer holds is gone, with the carousels listing the scenes they listed
 * before.
 *
 * A throwaway user of its own holds a flat carousel, a tree carousel, a flat
 * carousel naming `ids` (which stays flat: a tree cannot hold them), a
 * performer View with a lone gender and a default naming a missing View. The
 * integration server never runs data migrations, so the body is called
 * directly, for that user only (the shared admin's rows are never touched).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { migrateStoredFiltersToTrees } from "../../services/DataMigrationService.js";
import { must } from "../../tests/helpers/must.js";
import type {
  ExecuteCarouselByIdResponse,
  PreviewCarouselResponse,
} from "../../types/api/index.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import {
  type TestClient,
  adminClient,
  selectTestInstanceForClient,
} from "../helpers/testClient.js";

describe("data migration 012: Views and carousel trees", () => {
  let user: { id: number; client: TestClient };
  let flatRules: Record<string, unknown>;
  let flatId = "";
  let treeId = "";
  let idsId = "";
  let idsRules: Record<string, unknown>;

  /** The scenes a list answered, as instance/id, sorted */
  const listed = (scenes: readonly { id: string; instanceId: string }[]) =>
    scenes.map((scene) => `${scene.instanceId}/${scene.id}`).sort();

  const executed = async (id: string) => {
    const response = await user.client.get<ExecuteCarouselByIdResponse>(
      `/api/carousels/${id}/execute`
    );
    expect(response.status).toBe(200);
    return listed(response.data.scenes);
  };

  const previewed = async (rules: unknown) => {
    const response = await user.client.post<PreviewCarouselResponse>(
      "/api/carousels/preview",
      { rules, sort: "title", direction: "ASC" }
    );
    expect(response.status, JSON.stringify(response.data)).toBe(200);
    return listed(response.data.scenes);
  };

  const storedRules = async (id: string) =>
    (await prisma.userCarousel.findUniqueOrThrow({ where: { id } })).rules;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    user = await createApiUser("dm012_it_user", "dm012_it_pass_1");
    const instanceId = await selectTestInstanceForClient(user.client);

    flatRules = {
      studios: {
        value: [`${TEST_ENTITIES.studioWithScenes}:${instanceId}`],
        modifier: "INCLUDES",
      },
    };
    idsRules = {
      ids: {
        value: [TEST_ENTITIES.sceneWithRelations],
        modifier: "INCLUDES",
      },
    };
    const carousel = (title: string, rules: Record<string, unknown>) =>
      prisma.userCarousel.create({
        data: {
          userId: user.id,
          title,
          icon: "Film",
          rules: rules as object,
          sort: "title",
          direction: "ASC",
        },
      });
    flatId = (await carousel("Flat", flatRules)).id;
    treeId = (
      await carousel("Tree", {
        match: "all",
        rules: [{ field: "studios", criterion: flatRules.studios }],
      })
    ).id;
    idsId = (await carousel("Flat with ids", idsRules)).id;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        filterPresets: {
          performer: [
            {
              id: "fave",
              name: "Fave Ladies",
              filters: { gender: "FEMALE" },
              sort: "name",
              direction: "ASC",
              createdAt: "2025-11-08T02:04:38.675Z",
            },
          ],
        },
        defaultFilterPresets: { performer: "fave", tag: "deleted-view" },
      },
    });
  }, 60000);

  afterAll(async () => {
    await adminClient.delete(`/api/user/${user.id}`);
  }, 60000);

  it("stores the carousels as trees that list the scenes they listed, and the View and defaults in their canonical form", async () => {
    const beforeFlat = await executed(flatId);
    const beforeTree = await executed(treeId);
    const beforeIds = await executed(idsId);
    const beforePreview = await previewed(flatRules);
    expect(beforeFlat.length).toBeGreaterThan(0);
    expect(beforeIds).toHaveLength(1);

    const summary = await migrateStoredFiltersToTrees([user.id]);

    expect(summary).toEqual({
      users: 1,
      presets: 1,
      carousels: 1,
      presetsExamined: 1,
      valuesListed: 1,
      carouselsLeftFlat: 1,
      defaultsDropped: 1,
      droppedKeys: {},
      refsRewritten: 0,
      refsLeftBare: 0,
      skipped: 0,
    });

    // The flat carousel is its tree; the tree and the one with ids are as they were
    const tree = await storedRules(flatId);
    expect(tree).toEqual({
      match: "all",
      rules: [{ field: "studios", criterion: flatRules.studios }],
    });
    expect(await storedRules(treeId)).toEqual(tree);
    expect(await storedRules(idsId)).toEqual(idsRules);

    // The same scenes, through the stored rule and through the request
    expect(await executed(flatId)).toEqual(beforeFlat);
    expect(await executed(treeId)).toEqual(beforeTree);
    expect(await executed(idsId)).toEqual(beforeIds);
    expect(await previewed(tree)).toEqual(beforePreview);

    // The View reads with its value as a list; the dangling default is gone
    const presets = await user.client.get<{
      presets: { performer?: Array<{ id: string; filters: unknown }> };
    }>("/api/user/filter-presets");
    expect(must(presets.data.presets.performer?.[0]).filters).toEqual({
      gender: ["FEMALE"],
    });
    const defaults = await user.client.get<{
      defaults: Record<string, string>;
    }>("/api/user/default-presets");
    expect(defaults.data.defaults).toEqual({ performer: "fave" });
  });

  it("a second run writes nothing", async () => {
    const summary = await migrateStoredFiltersToTrees([user.id]);

    expect(summary).toEqual({
      users: 0,
      presets: 0,
      carousels: 0,
      presetsExamined: 1,
      valuesListed: 0,
      carouselsLeftFlat: 1,
      defaultsDropped: 0,
      droppedKeys: {},
      refsRewritten: 0,
      refsLeftBare: 0,
      skipped: 0,
    });
  });
});
