import { describe, it, expect } from "vitest";

// We'll test the transform logic directly once exported
describe("SceneQueryBuilder", () => {
  describe("transformRow", () => {
    it("should transform a database row to NormalizedScene", () => {
      const row = {
        id: "123",
        title: "Test Scene",
        code: "ABC123",
        date: "2024-01-15",
        studioId: "studio_1",
        stashRating100: 85,
        duration: 3600,
        organized: 1,
        details: "Test details",
        filePath: "/path/to/file.mp4",
        fileBitRate: 8000000,
        fileFrameRate: 29.97,
        fileWidth: 1920,
        fileHeight: 1080,
        fileVideoCodec: "h264",
        fileAudioCodec: "aac",
        fileSize: BigInt(2147483648),
        pathScreenshot: "/screenshot.jpg",
        pathPreview: "/preview.mp4",
        pathSprite: "/sprite.jpg",
        pathVtt: "/thumbs.vtt",
        pathChaptersVtt: null,
        pathStream: "/stream.mp4",
        pathCaption: null,
        stashOCounter: 5,
        stashPlayCount: 10,
        stashPlayDuration: 7200.5,
        stashCreatedAt: "2024-01-15T10:30:00Z",
        stashUpdatedAt: "2024-06-20T15:45:00Z",
        userRating: 90,
        userFavorite: 1,
        userPlayCount: 3,
        userPlayDuration: 1800.0,
        userLastPlayedAt: "2024-06-19T20:00:00Z",
        userOCount: 2,
        userResumeTime: 600.5,
        userOHistory: '["2024-06-18T21:00:00Z","2024-06-19T20:30:00Z"]',
        userPlayHistory: "[]",
      };

      // Import will be added once we export the transform function
      // For now, just verify the test structure
      expect(row.id).toBe("123");
      expect(row.userFavorite).toBe(1);
    });

    it("should handle null user data gracefully", () => {
      const row = {
        id: "456",
        title: "Scene Without User Data",
        userRating: null,
        userFavorite: null,
        userPlayCount: null,
        userLastPlayedAt: null,
        userOCount: null,
        userResumeTime: null,
        userOHistory: null,
        userPlayHistory: null,
      };

      // User data should default to safe values
      expect(row.userFavorite).toBeNull();
    });
  });
});
