/**
 * Unit Tests for Track Activity Plugin
 *
 * Tests the Video.js plugin for tracking watch history including:
 * - Play duration tracking
 * - Resume time calculation
 * - Play count threshold (minimum play percent)
 * - 98% completion reset behavior
 * - NaN handling for invalid durations
 */
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
// Import after mock
import TrackActivityPlugin from "../../../src/components/video-player/plugins/track-activity";

// Mock video.js
const mockPlayer = {
  currentTime: vi.fn(),
  duration: vi.fn(),
  paused: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock("video.js", () => ({
  default: {
    getPlugin: vi.fn(
      () =>
        class MockPlugin {
          player: any;
          constructor(player: any) {
            this.player = player;
          }
        }
    ),
    registerPlugin: vi.fn(),
  },
}));

/** Fire the handler the plugin registered on the player for `event` */
function disposePlayer() {
  for (const [event, handler] of mockPlayer.on.mock.calls) {
    if (event === "dispose") (handler as () => void)();
  }
}

/** What `document.visibilityState` answers */
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("TrackActivityPlugin", () => {
  let plugin: TrackActivityPlugin;
  let saveActivity: Mock<TrackActivityPlugin["saveActivity"]>;
  let incrementPlayCount: Mock<TrackActivityPlugin["incrementPlayCount"]>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Create plugin instance with mock player
    plugin = new TrackActivityPlugin(mockPlayer);
    saveActivity = vi.fn();
    incrementPlayCount = vi.fn();
    plugin.saveActivity = saveActivity;
    plugin.incrementPlayCount = incrementPlayCount;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (plugin.intervalID) {
      clearInterval(plugin.intervalID);
    }
    // Take this plugin's document and window listeners down
    disposePlayer();
    setVisibility("visible");
  });

  describe("initialization", () => {
    it("should initialize with default values", () => {
      expect(plugin.totalPlayDuration).toBe(0);
      expect(plugin.currentPlayDuration).toBe(0);
      expect(plugin.minimumPlayPercent).toBe(0);
      expect(plugin.enabled).toBe(false);
      expect(plugin.playCountIncremented).toBe(false);
    });
  });

  describe("setEnabled", () => {
    it("should enable tracking when set to true", () => {
      plugin.setEnabled(true);
      expect(plugin.enabled).toBe(true);
    });

    it("should disable tracking when set to false", () => {
      plugin.setEnabled(true);
      plugin.setEnabled(false);
      expect(plugin.enabled).toBe(false);
    });

    it("should stop interval when disabled", () => {
      plugin.setEnabled(true);
      mockPlayer.paused.mockReturnValue(false);

      // Manually start to simulate playing state
      plugin.start();
      expect(plugin.intervalID).toBeDefined();

      plugin.setEnabled(false);
      expect(plugin.intervalID).toBeUndefined();
    });
  });

  describe("partial intervals", () => {
    /** Playing for `seconds` on a 600 s video, now at `currentTime` */
    function playFor(seconds: number, currentTime: number) {
      mockPlayer.paused.mockReturnValue(false);
      mockPlayer.currentTime.mockReturnValue(currentTime);
      mockPlayer.duration.mockReturnValue(600);
      plugin.setEnabled(true);
      plugin.start();
      vi.advanceTimersByTime(seconds * 1000);
    }

    it("disabling sends the partial interval before it stops", () => {
      playFor(9, 9);
      expect(saveActivity).not.toHaveBeenCalled();

      plugin.setEnabled(false);

      expect(saveActivity).toHaveBeenCalledTimes(1);
      expect(saveActivity).toHaveBeenCalledWith(9, 9);
      expect(plugin.enabled).toBe(false);
      expect(plugin.intervalID).toBeUndefined();
    });

    it("a hidden tab flushes with keepalive and keeps tracking", () => {
      playFor(4, 4);

      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));

      expect(saveActivity).toHaveBeenCalledTimes(1);
      expect(saveActivity).toHaveBeenCalledWith(4, 4, {
        keepalive: true,
      });
      expect(plugin.intervalID).toBeDefined();
      expect(plugin.enabled).toBe(true);

      // The same seconds are not sent twice, and tracking goes on
      vi.advanceTimersByTime(2000);
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(saveActivity).toHaveBeenCalledTimes(2);
      expect(saveActivity).toHaveBeenLastCalledWith(4, 2, {
        keepalive: true,
      });
    });

    it("a tab that becomes visible sends nothing", () => {
      playFor(4, 4);

      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));

      expect(saveActivity).not.toHaveBeenCalled();
    });

    it("a hidden tab with nothing played since the last save sends nothing", () => {
      mockPlayer.paused.mockReturnValue(true);
      plugin.setEnabled(true);

      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));

      expect(saveActivity).not.toHaveBeenCalled();
    });

    it("pagehide flushes with keepalive", () => {
      playFor(6, 6);

      window.dispatchEvent(new Event("pagehide"));

      expect(saveActivity).toHaveBeenCalledTimes(1);
      expect(saveActivity).toHaveBeenCalledWith(6, 6, {
        keepalive: true,
      });
      expect(plugin.intervalID).toBeDefined();
    });

    it("a play count the flush reaches is sent with keepalive too", () => {
      plugin.minimumPlayPercent = 0.5;
      playFor(5, 5);
      expect(incrementPlayCount).not.toHaveBeenCalled();

      window.dispatchEvent(new Event("pagehide"));

      expect(incrementPlayCount).toHaveBeenCalledWith({
        keepalive: true,
      });
    });

    it("dispose removes the document listeners", () => {
      const documentAdd = vi.spyOn(document, "addEventListener");
      const documentRemove = vi.spyOn(document, "removeEventListener");
      const windowAdd = vi.spyOn(window, "addEventListener");
      const windowRemove = vi.spyOn(window, "removeEventListener");
      try {
        vi.mocked(mockPlayer.on).mockClear();
        const fresh = new TrackActivityPlugin(mockPlayer);
        fresh.saveActivity = vi.fn();
        const visibilityHandler = documentAdd.mock.calls.find(
          ([type]) => type === "visibilitychange"
        )?.[1];
        const pagehideHandler = windowAdd.mock.calls.find(
          ([type]) => type === "pagehide"
        )?.[1];
        expect(visibilityHandler).toBeDefined();
        expect(pagehideHandler).toBeDefined();

        disposePlayer();

        expect(documentRemove).toHaveBeenCalledWith(
          "visibilitychange",
          visibilityHandler
        );
        expect(windowRemove).toHaveBeenCalledWith("pagehide", pagehideHandler);
      } finally {
        documentAdd.mockRestore();
        documentRemove.mockRestore();
        windowAdd.mockRestore();
        windowRemove.mockRestore();
      }
    });

    it("a disposed plugin sends nothing when the tab hides", () => {
      playFor(4, 4);
      saveActivity.mockClear();

      disposePlayer();
      saveActivity.mockClear();
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pagehide"));

      expect(saveActivity).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("should reset all tracking state", () => {
      plugin.totalPlayDuration = 100;
      plugin.currentPlayDuration = 50;
      plugin.playCountIncremented = true;

      plugin.reset();

      expect(plugin.totalPlayDuration).toBe(0);
      expect(plugin.currentPlayDuration).toBe(0);
      expect(plugin.playCountIncremented).toBe(false);
    });
  });

  describe("sendActivity", () => {
    it("should not send activity when disabled", () => {
      plugin.enabled = false;
      plugin.totalPlayDuration = 10;

      plugin.sendActivity();

      expect(saveActivity).not.toHaveBeenCalled();
    });

    it("should not send activity when totalPlayDuration is 0", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 0;

      plugin.sendActivity();

      expect(saveActivity).not.toHaveBeenCalled();
    });

    it("should send activity with correct resume time and play duration", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(saveActivity).toHaveBeenCalledWith(120, 10);
    });

    it("should reset currentPlayDuration after sending", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(plugin.currentPlayDuration).toBe(0);
    });

    it("should reset resume time to 0 when video is 98% complete", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      // 98% of 600s = 588s
      mockPlayer.currentTime.mockReturnValue(588);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(saveActivity).toHaveBeenCalledWith(0, 10); // resume time reset to 0
    });

    it("should keep resume time when video is below 98% complete", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      // 97% of 600s = 582s
      mockPlayer.currentTime.mockReturnValue(582);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(saveActivity).toHaveBeenCalledWith(582, 10);
    });
  });

  describe("incrementPlayCount threshold", () => {
    it("should increment play count when threshold is reached", () => {
      plugin.enabled = true;
      plugin.minimumPlayPercent = 10;
      plugin.totalPlayDuration = 60; // 10% of 600s
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(incrementPlayCount).toHaveBeenCalled();
      expect(plugin.playCountIncremented).toBe(true);
    });

    it("should not increment play count when below threshold", () => {
      plugin.enabled = true;
      plugin.minimumPlayPercent = 10;
      plugin.totalPlayDuration = 50; // 8.3% of 600s (below 10%)
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(incrementPlayCount).not.toHaveBeenCalled();
      expect(plugin.playCountIncremented).toBe(false);
    });

    it("should only increment play count once per session", () => {
      plugin.enabled = true;
      plugin.minimumPlayPercent = 10;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(600);

      // First call - should increment
      plugin.sendActivity();
      expect(incrementPlayCount).toHaveBeenCalledTimes(1);

      // Second call - should not increment again
      plugin.currentPlayDuration = 10;
      plugin.sendActivity();
      expect(incrementPlayCount).toHaveBeenCalledTimes(1); // Still only 1
    });
  });

  describe("NaN handling", () => {
    it("should skip activity save when duration is NaN", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(NaN);

      plugin.sendActivity();

      expect(saveActivity).not.toHaveBeenCalled();
    });

    it("should skip activity save when duration is 0", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(0);

      plugin.sendActivity();

      expect(saveActivity).not.toHaveBeenCalled();
    });

    it("should skip activity save when duration is negative", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(-1);

      plugin.sendActivity();

      expect(saveActivity).not.toHaveBeenCalled();
    });

    it("should skip activity save when duration is Infinity", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(Infinity);

      plugin.sendActivity();

      expect(saveActivity).not.toHaveBeenCalled();
    });

    it("should use lastResumeTime when currentTime is NaN", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;
      plugin.lastResumeTime = 100;

      mockPlayer.currentTime.mockReturnValue(NaN);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(saveActivity).toHaveBeenCalledWith(100, 10);
    });

    it("should fallback to 0 when both currentTime and lastResumeTime are invalid", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;
      // Not a number, as a player that never reported a time leaves it
      plugin.lastResumeTime = Number.NaN;

      mockPlayer.currentTime.mockReturnValue(NaN);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(saveActivity).toHaveBeenCalledWith(0, 10);
    });
  });

  describe("player fallback values", () => {
    it("should use lastResumeTime when player.currentTime is unavailable", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;
      plugin.lastResumeTime = 150;
      plugin.lastDuration = 600;

      // Simulate player.currentTime() throwing or returning undefined
      mockPlayer.currentTime.mockReturnValue(undefined);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(saveActivity).toHaveBeenCalledWith(150, 10);
    });

    it("should use lastDuration when player.duration is unavailable", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;
      plugin.lastResumeTime = 150;
      plugin.lastDuration = 600;

      mockPlayer.currentTime.mockReturnValue(150);
      // Simulate player.duration() returning undefined
      mockPlayer.duration.mockReturnValue(undefined);

      plugin.sendActivity();

      // Should still work using lastDuration
      expect(saveActivity).toHaveBeenCalled();
    });
  });
});
