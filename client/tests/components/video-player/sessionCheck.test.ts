/**
 * The player's session check (sweep item 2): a <video> element cannot see
 * its source's HTTP status, so on an error the player asks /auth/check once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/api";
import { ApiError } from "@/api/client";
import {
  SESSION_EXPIRED_PLAYBACK_MESSAGE,
  isSessionExpired,
} from "@/components/video-player/sessionCheck";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);

describe("isSessionExpired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is true when /auth/check fails with 401 or 403", async () => {
    mockApiGet.mockRejectedValueOnce(new ApiError("No token", 401));
    await expect(isSessionExpired()).resolves.toBe(true);

    mockApiGet.mockRejectedValueOnce(new ApiError("Invalid token", 403));
    await expect(isSessionExpired()).resolves.toBe(true);

    expect(mockApiGet).toHaveBeenCalledWith("/auth/check");
  });

  it("is false on success and on a network error", async () => {
    mockApiGet.mockResolvedValueOnce({ authenticated: true });
    await expect(isSessionExpired()).resolves.toBe(false);

    mockApiGet.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(isSessionExpired()).resolves.toBe(false);

    mockApiGet.mockRejectedValueOnce(new ApiError("Server error", 500));
    await expect(isSessionExpired()).resolves.toBe(false);
  });

  it("carries the message the login page shows", () => {
    expect(SESSION_EXPIRED_PLAYBACK_MESSAGE).toBe(
      "Your session expired while the video was paused. Log in to keep watching."
    );
  });
});
