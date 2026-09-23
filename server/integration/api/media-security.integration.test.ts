/**
 * Media paths in API responses (item 1).
 *
 * Scene responses must carry no Stash API key and no Stash host in their
 * stream lists or media paths: the browser reaches Stash only through Peek's
 * proxies. Admins still receive stashUrl (the View in Stash link), which
 * holds the host by design, so the host check covers only sceneStreams and
 * paths.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { adminClient, selectTestInstanceOnly } from "../helpers/testClient.js";

interface FindScenesResponse {
  findScenes: {
    count: number;
    scenes: Array<{
      id: string;
      sceneStreams?: Array<{ url: string }>;
      paths?: Record<string, string | null>;
    }>;
  };
}

describe("media security", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await selectTestInstanceOnly();
  });

  it("scene list responses carry no API key and no Stash host in stream or media paths", async () => {
    const response = await adminClient.post<FindScenesResponse>(
      "/api/library/scenes",
      { filter: { per_page: 50 } }
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.data)).not.toContain("apikey");

    const stashHost = new URL(process.env.STASH_URL!).host;
    for (const scene of response.data.findScenes.scenes) {
      for (const stream of scene.sceneStreams ?? []) {
        expect(stream.url).not.toContain(stashHost);
      }
      for (const value of Object.values(scene.paths ?? {})) {
        if (value) expect(value).not.toContain(stashHost);
      }
    }
  });
});
