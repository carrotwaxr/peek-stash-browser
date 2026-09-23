import { describe, expect, it } from "vitest";
import { TEST_CONFIG } from "../helpers/config.js";

/**
 * Integration tests for login throttling per client address (sweep item 9).
 *
 * The test server is reached over loopback, the hop the image's own nginx
 * makes, so it trusts X-Forwarded-For from there. Every request here sends an
 * address from 203.0.113.0/24 (TEST-NET-3), which keeps localhost's own
 * limiter budget untouched for the other test files.
 */

interface LoginResult {
  status: number;
  retryAfter: string | null;
}

async function failedLogin(
  username: string,
  address: string
): Promise<LoginResult> {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": address,
    },
    body: JSON.stringify({ username, password: "NotThePassword1" }),
  });
  await response.text();
  return {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
  };
}

describe("Login throttling per client address", () => {
  it("five failed logins lock a username only for the address they came from", async () => {
    const username = `lockout_${Date.now()}`;

    for (let i = 0; i < 5; i++) {
      expect((await failedLogin(username, "203.0.113.30")).status).toBe(401);
    }

    const locked = await failedLogin(username, "203.0.113.30");
    expect(locked.status).toBe(423);
    expect(Number(locked.retryAfter)).toBeGreaterThan(0);

    expect((await failedLogin(username, "203.0.113.40")).status).toBe(401);
  });

  it("ten failed logins from one address do not throttle another", async () => {
    const base = `throttle_${Date.now()}`;

    let throttledAt = 0;
    for (let i = 1; i <= 11; i++) {
      const { status } = await failedLogin(`${base}_${i}`, "203.0.113.10");
      if (status === 429) {
        throttledAt = i;
        break;
      }
      expect(status).toBe(401);
    }
    expect(throttledAt).toBeGreaterThan(0);

    expect((await failedLogin(`${base}_other`, "203.0.113.20")).status).toBe(
      401
    );
  });
});
