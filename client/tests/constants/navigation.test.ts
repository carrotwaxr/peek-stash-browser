import { describe, expect, it } from "vitest";
import { getHelpPageForPath, getNavKeyForPath } from "@/constants/navigation";

describe("getNavKeyForPath", () => {
  it.each([
    ["/", "Home"],
    ["/scenes", "Scenes"],
    ["/scene/5", "Scenes"],
    ["/recommended", "Recommended"],
    ["/performers", "Performers"],
    ["/performer/3", "Performers"],
    ["/studios", "Studios"],
    ["/studio/", "Studios"],
    ["/studio/9", "Studios"],
    ["/tags", "Tags"],
    ["/tag/", "Tags"],
    ["/tag/4", "Tags"],
    ["/collections", "Collections"],
    ["/collection/", "Collections"],
    ["/collection/2", "Collections"],
    ["/galleries", "Galleries"],
    ["/gallery/", "Galleries"],
    ["/gallery/7", "Galleries"],
    ["/images", "Images"],
    ["/playlists", "Playlists"],
    ["/playlist/", "Playlists"],
    ["/playlist/8", "Playlists"],
    ["/clips", "Clips"],
    ["/watch-history", "Watch History"],
    ["/settings", "Settings"],
    ["/settings/carousels/new", "Settings"],
  ])("%s lights %s", (path, key) => {
    expect(getNavKeyForPath(path)).toBe(key);
  });

  it.each(["/user-stats", "/downloads", "/hidden-items", "/nowhere"])(
    "%s lights nothing",
    (path) => {
      expect(getNavKeyForPath(path)).toBeNull();
    }
  );

  it("does not match a longer word that starts with a section", () => {
    expect(getNavKeyForPath("/scenesque")).toBeNull();
  });
});

describe("getHelpPageForPath", () => {
  it.each([
    ["/scene/1", "scene"],
    ["/scenes", "scenes"],
    ["/performer/1", "performer"],
    ["/performers", "performers"],
    ["/studio/1", "studio"],
    ["/studios", "studios"],
    ["/tag/1", "tag"],
    ["/tags", "tags"],
    ["/gallery/1", "gallery"],
    ["/galleries", "galleries"],
    ["/collection/1", "group"],
    ["/collections", "groups"],
    ["/playlists", "playlists"],
    ["/user-stats", "global"],
    ["/", "global"],
  ])("%s is the %s help page", (path, page) => {
    expect(getHelpPageForPath(path)).toBe(page);
  });
});
