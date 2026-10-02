import { describe, expect, it } from "vitest";
import {
  ownPlaylistSql,
  viewablePlaylistSql,
} from "../../utils/playlistAccessSql.js";

describe("viewablePlaylistSql", () => {
  it("binds the viewer once per placeholder, in order", () => {
    const fragment = viewablePlaylistSql("p", 7);
    expect(fragment.params).toEqual([7, 7]);
    expect(fragment.sql.match(/\?/g)).toHaveLength(2);
  });

  it("reads the owner's override before the owner's groups, on the given alias", () => {
    const { sql } = viewablePlaylistSql("pl", 1);
    expect(sql).toContain("pl.userId = ?");
    expect(sql).toContain("ps.playlistId = pl.id");
    expect(sql).toContain("u.id = pl.userId");
    expect(sql).toContain("om.userId = pl.userId");
    expect(sql.indexOf("canShareOverride")).toBeLessThan(
      sql.indexOf("g.canShare")
    );
  });
});

describe("ownPlaylistSql", () => {
  it("matches the viewer's own rows only", () => {
    expect(ownPlaylistSql("p", 3)).toEqual({
      sql: "p.userId = ?",
      params: [3],
    });
  });
});
