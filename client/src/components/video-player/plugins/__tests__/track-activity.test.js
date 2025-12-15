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
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

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
    getPlugin: vi.fn(() =>
      class MockPlugin {
        constructor(player) {
          this.player = player;
        }
      }
    ),
    registerPlugin: vi.fn(),
  },
}));

// Import after mock
import TrackActivityPlugin from "../track-activity.js";

describe("TrackActivityPlugin", () => {
  let plugin;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Create plugin instance with mock player
    plugin = new TrackActivityPlugin(mockPlayer);
    plugin.saveActivity = vi.fn();
    plugin.incrementPlayCount = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (plugin.intervalID) {
      clearInterval(plugin.intervalID);
    }
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

      expect(plugin.saveActivity).not.toHaveBeenCalled();
    });

    it("should not send activity when totalPlayDuration is 0", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 0;

      plugin.sendActivity();

      expect(plugin.saveActivity).not.toHaveBeenCalled();
    });

    it("should send activity with correct resume time and play duration", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(plugin.saveActivity).toHaveBeenCalledWith(120, 10);
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

      expect(plugin.saveActivity).toHaveBeenCalledWith(0, 10); // resume time reset to 0
    });

    it("should keep resume time when video is below 98% complete", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      // 97% of 600s = 582s
      mockPlayer.currentTime.mockReturnValue(582);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(plugin.saveActivity).toHaveBeenCalledWith(582, 10);
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

      expect(plugin.incrementPlayCount).toHaveBeenCalled();
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

      expect(plugin.incrementPlayCount).not.toHaveBeenCalled();
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
      expect(plugin.incrementPlayCount).toHaveBeenCalledTimes(1);

      // Second call - should not increment again
      plugin.currentPlayDuration = 10;
      plugin.sendActivity();
      expect(plugin.incrementPlayCount).toHaveBeenCalledTimes(1); // Still only 1
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

      expect(plugin.saveActivity).not.toHaveBeenCalled();
    });

    it("should skip activity save when duration is 0", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(0);

      plugin.sendActivity();

      expect(plugin.saveActivity).not.toHaveBeenCalled();
    });

    it("should skip activity save when duration is negative", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(-1);

      plugin.sendActivity();

      expect(plugin.saveActivity).not.toHaveBeenCalled();
    });

    it("should skip activity save when duration is Infinity", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;

      mockPlayer.currentTime.mockReturnValue(120);
      mockPlayer.duration.mockReturnValue(Infinity);

      plugin.sendActivity();

      expect(plugin.saveActivity).not.toHaveBeenCalled();
    });

    it("should use lastResumeTime when currentTime is NaN", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;
      plugin.lastResumeTime = 100;

      mockPlayer.currentTime.mockReturnValue(NaN);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(plugin.saveActivity).toHaveBeenCalledWith(100, 10);
    });

    it("should fallback to 0 when both currentTime and lastResumeTime are invalid", () => {
      plugin.enabled = true;
      plugin.totalPlayDuration = 60;
      plugin.currentPlayDuration = 10;
      plugin.lastResumeTime = undefined;

      mockPlayer.currentTime.mockReturnValue(NaN);
      mockPlayer.duration.mockReturnValue(600);

      plugin.sendActivity();

      expect(plugin.saveActivity).toHaveBeenCalledWith(0, 10);
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

      expect(plugin.saveActivity).toHaveBeenCalledWith(150, 10);
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
      expect(plugin.saveActivity).toHaveBeenCalled();
    });
  });
});
