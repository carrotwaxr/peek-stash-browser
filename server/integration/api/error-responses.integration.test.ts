import { type AddressInfo, createServer } from "net";
import { beforeAll, describe, expect, it } from "vitest";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { adminClient } from "../helpers/testClient.js";

/**
 * What an admin hears when a handler fails (item 39): the central error
 * handler answers with typed errors written for the client, never a caught
 * error's own text. The connection failure names the reason (its code, not
 * the query, its variables or the key), and an unknown instance is a 404.
 */

/** A Stash URL on a local port nothing listens on, so connecting is refused. */
async function refusingStash(): Promise<{ url: string; apiKey: string }> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return {
    url: `http://127.0.0.1:${port}/graphql`,
    apiKey: "secret-key-value",
  };
}

describe("Error responses (integration)", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  }, 60000);

  it("creating an instance at an unreachable URL answers 400 with the reason and no query text", async () => {
    const created = await adminClient.post<Record<string, unknown>>(
      "/api/setup/stash-instance",
      { name: "Unreachable", ...(await refusingStash()) }
    );

    expect(created.status).toBe(400);
    expect(created.data).toEqual({
      error: "Could not connect to Stash server",
      errorType: "VALIDATION_ERROR",
      details: "Could not reach Stash (ECONNREFUSED)",
    });
    const text = JSON.stringify(created.data);
    expect(text).not.toContain("query");
    expect(text).not.toContain("variables");
    expect(text).not.toContain("secret-key-value");
  });

  it("re-probing the clips of an instance that is not loaded answers 404", async () => {
    const res = await adminClient.post<Record<string, unknown>>(
      "/api/sync/reprobe-clips",
      { instanceId: "no-such-instance" }
    );

    expect(res.status).toBe(404);
    expect(res.data.errorType).toBe("NOT_FOUND");
  });

  it("deleting a backup by a name that is not one of this database's answers 400", async () => {
    const res = await adminClient.delete<Record<string, unknown>>(
      "/api/admin/database/backups/not-a-backup.txt"
    );

    expect(res.status).toBe(400);
    expect(res.data).toEqual({
      error: "Invalid backup filename",
      errorType: "VALIDATION_ERROR",
    });
  });
});
