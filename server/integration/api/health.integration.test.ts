import { describe, it, expect } from "vitest";
import { guestClient } from "../helpers/testClient.js";

describe("Health API", () => {
  it("returns healthy status without authentication", async () => {
    const response = await guestClient.get<{ status: string }>("/api/health");

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe("healthy");
  });

  it("returns version without authentication", async () => {
    const response = await guestClient.get<{ server: string }>("/api/version");

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.data.server).toBeDefined();
    expect(typeof response.data.server).toBe("string");
  });
});
