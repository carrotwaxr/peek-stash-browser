import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  TestClient,
  adminClient,
  findTestInstanceId,
  restoreInstanceSelection,
  selectTestInstanceForClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

describe("Content Restrictions Integration Tests", () => {
  let testUserId: number;
  let testUserClient: TestClient;
  let testInstanceId: string;

  beforeAll(async () => {
    // Ensure admin client is logged in
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);

    // Scope to test instance only — avoids scanning production data during recompute
    testInstanceId = await selectTestInstanceOnly();

    // Create a test user for restriction testing
    const createResponse = await adminClient.post<{
      success: boolean;
      user?: { id: number; username: string };
    }>("/api/user/create", {
      username: "restriction_test_user",
      password: "test_password_123",
      role: "USER",
    });

    if (createResponse.ok && createResponse.data.user) {
      testUserId = createResponse.data.user.id;
    } else {
      // User might already exist from previous test run - fetch them
      const usersResponse = await adminClient.get<{
        users?: Array<{ id: number; username: string }>;
      }>("/api/user/all");

      const existingUser = usersResponse.data.users?.find(
        (u) => u.username === "restriction_test_user"
      );
      if (existingUser) {
        testUserId = existingUser.id;
      } else {
        throw new Error("Failed to create or find test user");
      }
    }

    // Create and login the test user client
    testUserClient = new TestClient();
    await testUserClient.login("restriction_test_user", "test_password_123");

    // Also scope the test user to test instance only
    await selectTestInstanceForClient(testUserClient);
  });

  afterAll(async () => {
    await restoreInstanceSelection();
    // Clean up: delete the test user
    if (testUserId) {
      await adminClient.delete(`/api/user/${testUserId}`);
    }
  });

  describe("User Content Restrictions (Admin API)", () => {
    describe("GET /api/user/:userId/restrictions", () => {
      it("should return empty restrictions for new user", async () => {
        const response = await adminClient.get<{
          restrictions: Array<{
            entityType: string;
            mode: string;
            entityIds: string;
          }>;
        }>(`/api/user/${testUserId}/restrictions`);

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.restrictions).toBeDefined();
        expect(Array.isArray(response.data.restrictions)).toBe(true);
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.get(
          `/api/user/${testUserId}/restrictions`
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });

      it("GET answers a stored list that cannot be read as unreadable, and the others parsed", async () => {
        // Stored as older code or a hand edit could leave them; the save
        // path cannot write these, so they go in directly
        const stored = [
          ["tags", "INCLUDE", JSON.stringify(["5:inst-a", "6"])],
          ["tags", "EXCLUDE", "[]"],
          ["studios", "EXCLUDE", "not json"],
          ["groups", "EXCLUDE", JSON.stringify({ id: "1:inst-a" })],
          ["galleries", "EXCLUDE", JSON.stringify([3])],
        ] as const;
        await prisma.userContentRestriction.createMany({
          data: stored.map(([entityType, mode, entityIds]) => ({
            userId: testUserId,
            entityType,
            mode,
            entityIds,
            restrictEmpty: entityType === "tags",
          })),
        });
        try {
          const response = await adminClient.get<{
            restrictions: Array<{
              entityType: string;
              mode: string;
              entityIds: string[] | null;
              unreadable: boolean;
              restrictEmpty: boolean;
            }>;
          }>(`/api/user/${testUserId}/restrictions`);

          expect(response.status).toBe(200);
          const byList = Object.fromEntries(
            response.data.restrictions.map((r) => [
              `${r.entityType}/${r.mode}`,
              {
                entityIds: r.entityIds,
                unreadable: r.unreadable,
                restrictEmpty: r.restrictEmpty,
              },
            ])
          );
          expect(byList).toEqual({
            "tags/INCLUDE": {
              entityIds: ["5:inst-a", "6"],
              unreadable: false,
              restrictEmpty: true,
            },
            "tags/EXCLUDE": {
              entityIds: [],
              unreadable: false,
              restrictEmpty: true,
            },
            "studios/EXCLUDE": {
              entityIds: null,
              unreadable: true,
              restrictEmpty: false,
            },
            "groups/EXCLUDE": {
              entityIds: null,
              unreadable: true,
              restrictEmpty: false,
            },
            "galleries/EXCLUDE": {
              entityIds: null,
              unreadable: true,
              restrictEmpty: false,
            },
          });
        } finally {
          await prisma.userContentRestriction.deleteMany({
            where: { userId: testUserId },
          });
        }
      });
    });

    describe("PUT /api/user/:userId/restrictions", () => {
      it("should create tag-based restrictions", async () => {
        const restrictions = [
          {
            entityType: "tags",
            mode: "EXCLUDE",
            entityIds: [`${TEST_ENTITIES.restrictableTag}:${testInstanceId}`],
            restrictEmpty: false,
          },
        ];

        const response = await adminClient.put<{
          success: boolean;
          restrictions: Array<unknown>;
        }>(`/api/user/${testUserId}/restrictions`, { restrictions });

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.restrictions).toHaveLength(1);
      }, 30_000); // PUT restrictions triggers exclusion recompute

      it("should update existing restrictions", async () => {
        const restrictions = [
          {
            entityType: "tags",
            mode: "INCLUDE",
            entityIds: [`${TEST_ENTITIES.tagWithEntities}:${testInstanceId}`],
            restrictEmpty: true,
          },
        ];

        const response = await adminClient.put<{
          success: boolean;
          restrictions: Array<unknown>;
        }>(`/api/user/${testUserId}/restrictions`, { restrictions });

        expect(response.ok).toBe(true);
        expect(response.data.success).toBe(true);
      }, 30_000); // INCLUDE + restrictEmpty: true scans all entities per type; may queue behind prior recompute

      it("should validate entity type", async () => {
        const restrictions = [
          {
            entityType: "invalid_type",
            mode: "EXCLUDE",
            entityIds: ["1"],
            restrictEmpty: false,
          },
        ];

        const response = await adminClient.put<{ error: string }>(
          `/api/user/${testUserId}/restrictions`,
          { restrictions }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("Invalid entity type");
      });

      it("should validate mode", async () => {
        const restrictions = [
          {
            entityType: "tags",
            mode: "INVALID_MODE",
            entityIds: ["1"],
            restrictEmpty: false,
          },
        ];

        const response = await adminClient.put<{ error: string }>(
          `/api/user/${testUserId}/restrictions`,
          { restrictions }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("Invalid mode");
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.put(
          `/api/user/${testUserId}/restrictions`,
          { restrictions: [] }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });

      it("an id on an unknown instance answers 400 and writes nothing", async () => {
        const before = await adminClient.get<{ restrictions: unknown[] }>(
          `/api/user/${testUserId}/restrictions`
        );
        expect(before.ok).toBe(true);

        const response = await adminClient.put<{ error: string }>(
          `/api/user/${testUserId}/restrictions`,
          {
            restrictions: [
              {
                entityType: "tags",
                mode: "EXCLUDE",
                entityIds: [
                  `${TEST_ENTITIES.restrictableTag}:no-such-instance`,
                ],
                restrictEmpty: false,
              },
            ],
          }
        );

        expect(response.status).toBe(400);
        expect(response.data.error).toContain(
          `${TEST_ENTITIES.restrictableTag}:no-such-instance`
        );
        const after = await adminClient.get<{ restrictions: unknown[] }>(
          `/api/user/${testUserId}/restrictions`
        );
        expect(after.data.restrictions).toEqual(before.data.restrictions);
      });

      it("a bare id answers 400 naming it, unless a stored list of its type already holds it", async () => {
        const bare = TEST_ENTITIES.restrictableTag;
        const list = (entityIds: string[]) => ({
          restrictions: [
            {
              entityType: "tags",
              mode: "EXCLUDE",
              entityIds,
              restrictEmpty: false,
            },
          ],
        });
        await adminClient.delete(`/api/user/${testUserId}/restrictions`);
        try {
          const refused = await adminClient.put<{ error: string }>(
            `/api/user/${testUserId}/restrictions`,
            list([bare])
          );
          expect(refused.status).toBe(400);
          expect(refused.data.error).toBe(
            `Entity id in tags EXCLUDE needs its instance: ${bare}`
          );
          expect(
            await prisma.userContentRestriction.count({
              where: { userId: testUserId },
            })
          ).toBe(0);

          // A list stored before entries named their instance saves again
          await prisma.userContentRestriction.create({
            data: {
              userId: testUserId,
              entityType: "tags",
              mode: "EXCLUDE",
              entityIds: JSON.stringify([bare]),
              restrictEmpty: false,
            },
          });
          const kept = await adminClient.put(
            `/api/user/${testUserId}/restrictions`,
            list([bare, `${TEST_ENTITIES.tagWithEntities}:${testInstanceId}`])
          );
          expect(kept.status).toBe(200);
        } finally {
          await adminClient.delete(`/api/user/${testUserId}/restrictions`);
        }
      }, 30_000);
    });

    describe("DELETE /api/user/:userId/restrictions", () => {
      it("DELETE for an unknown user answers 404", async () => {
        const response = await adminClient.delete<{ error: string }>(
          "/api/user/999999/restrictions"
        );

        expect(response.status).toBe(404);
      });

      it("DELETE for a non-numeric id answers 400", async () => {
        const response = await adminClient.delete<{ error: string }>(
          "/api/user/abc/restrictions"
        );

        expect(response.status).toBe(400);
      });

      it("DELETE clears the rows and the exclusions they produced together", async () => {
        const put = await adminClient.put(
          `/api/user/${testUserId}/restrictions`,
          {
            restrictions: [
              {
                entityType: "tags",
                mode: "EXCLUDE",
                entityIds: [
                  `${TEST_ENTITIES.restrictableTag}:${testInstanceId}`,
                ],
                restrictEmpty: false,
              },
            ],
          }
        );
        expect(put.ok).toBe(true);
        const restricted = {
          userId: testUserId,
          entityType: "tag",
          entityId: TEST_ENTITIES.restrictableTag,
          reason: "restricted",
        };
        expect(
          await prisma.userExcludedEntity.count({ where: restricted })
        ).toBeGreaterThan(0);

        const response = await adminClient.delete<{ success: boolean }>(
          `/api/user/${testUserId}/restrictions`
        );

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(
          await prisma.userContentRestriction.count({
            where: { userId: testUserId },
          })
        ).toBe(0);
        expect(
          await prisma.userExcludedEntity.count({
            where: { userId: testUserId, reason: "restricted" },
          })
        ).toBe(0);
      }, 30_000);

      it("should delete all restrictions", async () => {
        // First create some restrictions
        await adminClient.put(`/api/user/${testUserId}/restrictions`, {
          restrictions: [
            {
              entityType: "tags",
              mode: "EXCLUDE",
              entityIds: [`${TEST_ENTITIES.restrictableTag}:${testInstanceId}`],
              restrictEmpty: false,
            },
          ],
        });

        // Now delete them
        const response = await adminClient.delete<{
          success: boolean;
          message: string;
        }>(`/api/user/${testUserId}/restrictions`);

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);

        // Verify they're gone
        const getResponse = await adminClient.get<{
          restrictions: Array<unknown>;
        }>(`/api/user/${testUserId}/restrictions`);

        expect(getResponse.data.restrictions).toHaveLength(0);
      }, 30_000); // PUT + DELETE both trigger exclusion recompute; may queue behind prior

      it("should reject non-admin access", async () => {
        const response = await testUserClient.delete(
          `/api/user/${testUserId}/restrictions`
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });
  });

  describe("Hidden Entities (User API)", () => {
    describe("POST /api/user/hidden-entities", () => {
      it("should hide an entity", async () => {
        const response = await testUserClient.post<{
          success: boolean;
          message: string;
        }>("/api/user/hidden-entities", {
          entityType: "scene",
          entityId: TEST_ENTITIES.sceneWithRelations,
          instanceId: testInstanceId,
        });

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      }, 30_000); // Hide triggers addHiddenEntity with cascade computation

      it("should cascade exclusions when hiding performer with scenes", async () => {
        // First, clean up any existing hidden entities for this user
        await testUserClient.delete("/api/user/hidden-entities/all");

        // Hide a performer that has scenes - this should cascade to exclude those scenes
        const hideResponse = await testUserClient.post<{
          success: boolean;
          message: string;
        }>("/api/user/hidden-entities", {
          entityType: "performer",
          entityId: TEST_ENTITIES.performerWithScenes,
          instanceId: testInstanceId,
        });

        // If this fails with a 500 error, it means the cascade exclusion code is broken
        // (e.g., using skipDuplicates which SQLite doesn't support)
        expect(hideResponse.ok).toBe(true);
        expect(hideResponse.status).toBe(200);
        expect(hideResponse.data.success).toBe(true);

        // Verify the exclusion was created by checking the hidden entities list
        const hiddenResponse = await testUserClient.get<{
          items: Array<{ entityType: string; entityId: string }>;
        }>("/api/user/hidden-entities");

        expect(hiddenResponse.ok).toBe(true);
        const hiddenPerformer = hiddenResponse.data.items.find(
          (e) =>
            e.entityType === "performer" &&
            e.entityId === TEST_ENTITIES.performerWithScenes
        );
        expect(hiddenPerformer).toBeDefined();

        // Clean up
        await testUserClient.delete(
          `/api/user/hidden-entities/performer/${TEST_ENTITIES.performerWithScenes}?instanceId=${testInstanceId}`
        );
      }, 30_000); // unhideAll recompute + performer cascade + cleanup recompute

      it("should require entity type and ID", async () => {
        const response = await testUserClient.post<{ error: string }>(
          "/api/user/hidden-entities",
          {}
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("required");
      });

      it("should validate entity type", async () => {
        const response = await testUserClient.post<{ error: string }>(
          "/api/user/hidden-entities",
          {
            entityType: "invalid",
            entityId: "1",
          }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("Invalid entity type");
      });
    });

    describe("GET /api/user/hidden-entities", () => {
      it("should return a page of hidden entities with counts", async () => {
        const response = await testUserClient.get<{
          items: Array<{
            entityType: string;
            entityId: string;
          }>;
          total: number;
          counts: Record<string, number>;
        }>("/api/user/hidden-entities");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data.items)).toBe(true);
        expect(typeof response.data.total).toBe("number");
        expect(typeof response.data.counts.scene).toBe("number");
      });

      it("should filter by entity type", async () => {
        const response = await testUserClient.get<{
          items: Array<{ entityType: string }>;
        }>("/api/user/hidden-entities?entityType=scene");

        expect(response.ok).toBe(true);
        // All returned should be scenes
        for (const entity of response.data.items) {
          expect(entity.entityType).toBe("scene");
        }
      });
    });

    describe("DELETE /api/user/hidden-entities/:entityType/:entityId", () => {
      it("should unhide an entity", async () => {
        const instanceId = await findTestInstanceId();
        const stored = () =>
          prisma.userHiddenEntity.count({
            where: {
              userId: testUserId,
              entityType: "performer",
              entityId: TEST_ENTITIES.performerWithScenes,
              instanceId,
            },
          });

        // First hide it, on the test instance
        const hide = await testUserClient.post("/api/user/hidden-entities", {
          entityType: "performer",
          entityId: TEST_ENTITIES.performerWithScenes,
          instanceId,
        });
        expect(hide.status).toBe(200);
        expect(await stored()).toBe(1);

        // Now unhide it
        const response = await testUserClient.delete<{
          success: boolean;
          message: string;
        }>(
          `/api/user/hidden-entities/performer/${TEST_ENTITIES.performerWithScenes}?instanceId=${instanceId}`
        );

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(await stored()).toBe(0);
      }, 30_000); // Hide + unhide both trigger exclusion recompute
    });

    describe("DELETE /api/user/hidden-entities/all", () => {
      it("should unhide all entities", async () => {
        // Hide a few entities, on the test instance
        const instanceId = await findTestInstanceId();
        const hideScene = await testUserClient.post(
          "/api/user/hidden-entities",
          {
            entityType: "scene",
            entityId: TEST_ENTITIES.sceneWithRelations,
            instanceId,
          }
        );
        const hidePerformer = await testUserClient.post(
          "/api/user/hidden-entities",
          {
            entityType: "performer",
            entityId: TEST_ENTITIES.performerWithScenes,
            instanceId,
          }
        );
        expect([hideScene.status, hidePerformer.status]).toEqual([200, 200]);

        // Unhide all
        const response = await testUserClient.delete<{
          success: boolean;
          count: number;
        }>("/api/user/hidden-entities/all");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.count).toBeGreaterThanOrEqual(0);
      }, 30_000); // 2 hides + unhideAll; recompute can chain behind pending ops

      it("should unhide all entities of a specific type", async () => {
        // Hide some scenes, on the test instance
        const hide = await testUserClient.post("/api/user/hidden-entities", {
          entityType: "scene",
          entityId: TEST_ENTITIES.sceneWithRelations,
          instanceId: await findTestInstanceId(),
        });
        expect(hide.status).toBe(200);

        // Unhide all scenes
        const response = await testUserClient.delete<{
          success: boolean;
          count: number;
        }>("/api/user/hidden-entities/all?entityType=scene");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      }, 30_000); // Hide + unhideAll triggers exclusion recompute
    });
  });

  describe("Exclusion Management (Admin API)", () => {
    describe("POST /api/exclusions/recompute/:userId", () => {
      it("should recompute exclusions for a user", async () => {
        const response = await adminClient.post<{
          ok: boolean;
          message: string;
        }>(`/api/exclusions/recompute/${testUserId}`);

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.ok).toBe(true);
        expect(response.data.message).toContain("Recomputed");
      }, 30_000); // Recompute can be slow; may queue behind prior background ops

      it("should reject invalid user ID", async () => {
        const response = await adminClient.post<{ error: string }>(
          "/api/exclusions/recompute/invalid"
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
      });

      it("should reject non-existent user", async () => {
        const response = await adminClient.post<{ error: string }>(
          "/api/exclusions/recompute/999999"
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(404);
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.post(
          `/api/exclusions/recompute/${testUserId}`
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });

    describe("POST /api/exclusions/recompute-all", () => {
      it("should recompute exclusions for all users", async () => {
        const response = await adminClient.post<{
          ok: boolean;
          success: number;
          failed: number;
        }>("/api/exclusions/recompute-all");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.ok).toBe(true);
        expect(typeof response.data.success).toBe("number");
        expect(response.data.failed).toBe(0);
      }, 30_000); // Recomputes all users' exclusions; may queue behind pending ops

      it("should reject non-admin access", async () => {
        const response = await testUserClient.post(
          "/api/exclusions/recompute-all"
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });

    describe("GET /api/exclusions/stats", () => {
      it("should return exclusion statistics", async () => {
        const response = await adminClient.get<
          Array<{
            userId: number;
            entityType: string;
            reason: string;
            _count: number;
          }>
        >("/api/exclusions/stats");

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
      });

      it("should reject non-admin access", async () => {
        const response = await testUserClient.get("/api/exclusions/stats");

        expect(response.ok).toBe(false);
        expect(response.status).toBe(403);
      });
    });
  });

  describe("Hide Confirmation Preference", () => {
    describe("PUT /api/user/hide-confirmation", () => {
      it("should update hide confirmation preference", async () => {
        const response = await testUserClient.put<{
          success: boolean;
          hideConfirmationDisabled: boolean;
        }>("/api/user/hide-confirmation", {
          hideConfirmationDisabled: true,
        });

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.hideConfirmationDisabled).toBe(true);
      });

      it("should validate boolean input", async () => {
        const response = await testUserClient.put<{ error: string }>(
          "/api/user/hide-confirmation",
          {
            hideConfirmationDisabled: "not a boolean",
          }
        );

        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
        expect(response.data.error).toContain("boolean");
      });
    });
  });
});
