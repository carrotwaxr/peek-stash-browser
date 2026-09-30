import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findGroups } from "../../controllers/library/groups.js";
import { findPerformers } from "../../controllers/library/performers.js";
import { findStudios } from "../../controllers/library/studios.js";
import { findTags } from "../../controllers/library/tags.js";
import type { RequestUser } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import {
  reqFor,
  resFor,
  testUser,
} from "../../tests/helpers/controllerTestUtils.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  type RecordedStatement,
  recordStatements,
} from "../helpers/statementRecorder.js";
import {
  adminClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

/**
 * Tag Parent Name Hydration Integration Tests
 *
 * Tests that parent tag names are properly hydrated (not empty strings).
 * Bug: TagQueryBuilder was setting parent names to empty string "",
 * and the controller merge was overwriting hydrated names.
 *
 * And that no tag or studio request reads a whole table (A9, C10): each
 * handler runs in this process under `recordStatements`, and no statement
 * reading StashTag or StashStudio may go without a condition on ids or
 * instances.
 */

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      parents?: Array<{ id: string; name: string }>;
      children?: Array<{ id: string; name: string }>;
    }>;
    count: number;
  };
}

interface FindStudiosResponse {
  findStudios: {
    studios: Array<{
      id: string;
      instanceId: string;
      parent_studio?: { id: string } | null;
    }>;
  };
}

/**
 * The statements that read StashTag or StashStudio with no condition on ids
 * or instances: a model `findMany` whose `where` names neither, or raw SQL
 * whose WHERE names neither.
 */
function wholeTableReads(
  statements: readonly RecordedStatement[]
): RecordedStatement[] {
  return statements.filter(({ sql, params }) => {
    if (sql === "stashTag.findMany" || sql === "stashStudio.findMany") {
      const where =
        (params[0] as { where?: Record<string, unknown> } | undefined)?.where ??
        {};
      return !("id" in where) && !("stashInstanceId" in where);
    }
    if (!/\bFROM Stash(Tag|Studio)\b/.test(sql)) return false;
    const where = sql.slice(sql.lastIndexOf("WHERE"));
    return !sql.includes("WHERE") || !/\.id\b|stashInstanceId/.test(where);
  });
}

/** Runs a handler for the admin in this process; its statements and status */
async function recordHandler(
  run: (user: RequestUser) => Promise<number>
): Promise<{ status: number; statements: RecordedStatement[] }> {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { username: TEST_ADMIN.username },
  });
  const user = testUser({
    id: admin.id,
    username: admin.username,
    role: "ADMIN",
  });
  const recorder = recordStatements({
    stashTag: ["findMany"],
    stashStudio: ["findMany"],
  });
  try {
    const status = await run(user);
    return { status, statements: recorder.statements };
  } finally {
    recorder.restore();
  }
}

const tagsRequest = (body: object) =>
  recordHandler(async (user) => {
    const res = resFor(findTags);
    await findTags(
      reqFor(findTags, {
        body,
        user,
        allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
      }),
      res
    );
    return res._getStatus();
  });

const studiosRequest = (body: object) =>
  recordHandler(async (user) => {
    const res = resFor(findStudios);
    await findStudios(
      reqFor(findStudios, {
        body,
        user,
        allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
      }),
      res
    );
    return res._getStatus();
  });

describe("Tag Parent Name Hydration", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // The second library reuses the test library's ids: only the test
    // instance, so a bare id names one tag or studio
    await selectTestInstanceOnly();
  });

  afterAll(restoreInstanceSelection);

  it("the tag detail request runs no full-table tag load", async () => {
    const listResponse = await adminClient.post<FindTagsResponse>(
      "/api/library/tags",
      { filter: { per_page: 250 } }
    );
    const tagWithParents = must(
      listResponse.data.findTags.tags.find(
        (t) => t.parents && t.parents.length > 0
      ),
      "a tag with parents"
    );
    const parent = must(tagWithParents.parents?.[0], "its parent");

    // A child's page and its parent's
    for (const id of [tagWithParents.id, parent.id]) {
      const { status, statements } = await tagsRequest({ ids: [id] });
      expect(status).toBe(200);
      expect(statements.length).toBeGreaterThan(0);
      expect(wholeTableReads(statements)).toEqual([]);
    }
  });

  it("the studio detail request runs no full-table studio load", async () => {
    const listResponse = await adminClient.post<FindStudiosResponse>(
      "/api/library/studios",
      { filter: { per_page: 250 } }
    );
    const studios = listResponse.data.findStudios.studios;
    const child = studios.find((s) => s.parent_studio);
    const ids = [
      TEST_ENTITIES.studioWithScenes,
      ...(child ? [child.id, must(child.parent_studio).id] : []),
    ];

    for (const id of ids) {
      const { status, statements } = await studiosRequest({ ids: [id] });
      expect(status).toBe(200);
      expect(wholeTableReads(statements)).toEqual([]);
    }
  });

  it("the Tags and Studios list pages read no whole tag or studio table", async () => {
    const tags = await tagsRequest({ filter: { per_page: 250 } });
    expect(tags.status).toBe(200);
    expect(wholeTableReads(tags.statements)).toEqual([]);

    const studios = await studiosRequest({ filter: { per_page: 250 } });
    expect(studios.status).toBe(200);
    expect(wholeTableReads(studios.statements)).toEqual([]);
  });

  it("a performer's and a collection's detail requests read no whole tag table", async () => {
    const performer = await recordHandler(async (user) => {
      const res = resFor(findPerformers);
      await findPerformers(
        reqFor(findPerformers, {
          body: { ids: [TEST_ENTITIES.performerWithScenes] },
          user,
          allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
        }),
        res
      );
      return res._getStatus();
    });
    expect(performer.status).toBe(200);
    expect(wholeTableReads(performer.statements)).toEqual([]);

    const group = await recordHandler(async (user) => {
      const res = resFor(findGroups);
      await findGroups(
        reqFor(findGroups, {
          body: { ids: [TEST_ENTITIES.groupWithScenes] },
          user,
          allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
        }),
        res
      );
      return res._getStatus();
    });
    expect(group.status).toBe(200);
    expect(wholeTableReads(group.statements)).toEqual([]);
  });

  it("hydrates parent tag names (not empty strings) in list view", async () => {
    // Every tag; some have parents
    const response = await adminClient.post<FindTagsResponse>(
      "/api/library/tags",
      { filter: { per_page: 250 } }
    );

    expect(response.ok).toBe(true);
    expect(response.data.findTags.count).toBeGreaterThan(0);

    // Find a tag that actually has parents in the response
    const tagWithParents = must(
      response.data.findTags.tags.find(
        (t) => t.parents && t.parents.length > 0
      ),
      "a tag with parents"
    );
    const parents = must(tagWithParents.parents, "parents");
    expect(parents.length).toBeGreaterThan(0);

    // Each parent should have a non-empty name
    for (const parent of parents) {
      expect(parent.id).toBeDefined();
      expect(parent.name).toBeDefined();
      expect(parent.name.length).toBeGreaterThan(0);
      expect(parent.name).not.toBe("");
      expect(parent.name).not.toBe("Unknown");
    }
  });

  it("hydrates parent tag names on single-tag detail request", async () => {
    // First find a tag that has parents
    const listResponse = await adminClient.post<FindTagsResponse>(
      "/api/library/tags",
      { filter: { per_page: 250 } }
    );

    expect(listResponse.ok).toBe(true);
    const tagWithParents = must(
      listResponse.data.findTags.tags.find(
        (t) => t.parents && t.parents.length > 0
      ),
      "a tag with parents"
    );

    // Now request this specific tag by ID (single-tag detail request path)
    const detailResponse = await adminClient.post<FindTagsResponse>(
      "/api/library/tags",
      {
        ids: [tagWithParents.id],
      }
    );

    expect(detailResponse.ok).toBe(true);
    expect(detailResponse.data.findTags.tags).toHaveLength(1);

    const tag = must(detailResponse.data.findTags.tags[0]);
    const parents = must(tag.parents, "parents");
    expect(parents.length).toBeGreaterThan(0);

    // Each parent should have a non-empty name
    for (const parent of parents) {
      expect(parent.id).toBeDefined();
      expect(parent.name).toBeDefined();
      expect(parent.name.length).toBeGreaterThan(0);
      expect(parent.name).not.toBe("");
      expect(parent.name).not.toBe("Unknown");
    }
  });
});
