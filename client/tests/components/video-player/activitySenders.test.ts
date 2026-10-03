/**
 * One viewing of a scene: the save-activity and play-count senders the local
 * tracker and the cast tracker share. A viewing counts its play once,
 * whichever tracker reaches the threshold, with one token on every retry.
 */
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiPost } from "@/api";
import { createViewing } from "@/components/video-player/activitySenders";

vi.mock("@/api", () => ({
  apiFetch: vi.fn(() => Promise.resolve({ success: true })),
  apiPost: vi.fn(() => Promise.resolve({ success: true })),
}));

/** The JSON a request was sent with */
function requestBody(options: RequestInit | undefined): unknown {
  const body = options?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

const playCounts = () =>
  vi
    .mocked(apiPost)
    .mock.calls.filter(([endpoint]) => endpoint.endsWith("play-count"));

describe("createViewing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a save carries the scene's id, its instance, the resume point and the played seconds", async () => {
    const viewing = createViewing("123", "inst-b");

    await viewing.save(42, 10);

    expect(vi.mocked(apiPost).mock.calls).toEqual([
      [
        "/watch-history/save-activity",
        {
          sceneId: "123",
          instanceId: "inst-b",
          resumeTime: 42,
          playDuration: 10,
        },
      ],
    ]);
  });

  it("a keepalive save posts once with keepalive: true and no retry", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const viewing = createViewing("123", "inst-a");

    await viewing.save(5, 3, { keepalive: true });

    expect(vi.mocked(apiFetch).mock.calls).toHaveLength(1);
    const [endpoint, options] = must(vi.mocked(apiFetch).mock.calls[0]);
    expect(endpoint).toBe("/watch-history/save-activity");
    expect(options?.method).toBe("POST");
    expect(options?.keepalive).toBe(true);
    expect(requestBody(options)).toEqual({
      sceneId: "123",
      instanceId: "inst-a",
      resumeTime: 5,
      playDuration: 3,
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("the play count carries the viewing's token, the same on every retry", async () => {
    vi.mocked(apiPost)
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const viewing = createViewing("123", "inst-a");

    const pending = viewing.countPlay();
    await vi.advanceTimersByTimeAsync(3500);
    await pending;

    expect(viewing.playToken).toMatch(/^[0-9a-f]{32}$/);
    expect(playCounts()).toEqual([
      [
        "/watch-history/increment-play-count",
        { sceneId: "123", instanceId: "inst-a", playToken: viewing.playToken },
      ],
      [
        "/watch-history/increment-play-count",
        { sceneId: "123", instanceId: "inst-a", playToken: viewing.playToken },
      ],
      [
        "/watch-history/increment-play-count",
        { sceneId: "123", instanceId: "inst-a", playToken: viewing.playToken },
      ],
    ]);
  });

  it("a keepalive play count posts once with its token and keepalive: true", async () => {
    const viewing = createViewing("123", "inst-a");

    await viewing.countPlay({ keepalive: true });

    const [endpoint, options] = must(vi.mocked(apiFetch).mock.calls[0]);
    expect(endpoint).toBe("/watch-history/increment-play-count");
    expect(options?.keepalive).toBe(true);
    expect(requestBody(options)).toEqual({
      sceneId: "123",
      instanceId: "inst-a",
      playToken: viewing.playToken,
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("countPlay is a no-op once counted, whichever tracker asks", async () => {
    const viewing = createViewing("123", "inst-a");
    expect(viewing.counted).toBe(false);

    await viewing.countPlay();
    expect(viewing.counted).toBe(true);
    await viewing.countPlay();
    await viewing.countPlay({ keepalive: true });

    expect(playCounts()).toHaveLength(1);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("each viewing has its own token and its own count", async () => {
    const first = createViewing("123", "inst-a");
    const second = createViewing("123", "inst-a");

    await first.countPlay();
    await second.countPlay();

    expect(second.playToken).not.toBe(first.playToken);
    expect(playCounts()).toHaveLength(2);
  });
});
