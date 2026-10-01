/**
 * The Playlist table has no `isPublic` column: nothing read it, and sharing
 * goes through PlaylistShare (`docs/user-guide/playlists.md`).
 */
import { Prisma } from "@prisma/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

describe("Playlist schema", () => {
  it("the generated client has no isPublic field on Playlist", () => {
    expect(Object.keys(Prisma.PlaylistScalarFieldEnum)).not.toContain(
      "isPublic"
    );
  });

  it("schema.prisma has no isPublic field on Playlist", () => {
    const schema = readFileSync(
      fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url)),
      "utf8"
    );
    const model = /model Playlist \{[\s\S]*?\n\}/.exec(schema)?.[0];
    expect(model).toBeDefined();
    expect(model).not.toMatch(/\bisPublic\b/);
  });
});
