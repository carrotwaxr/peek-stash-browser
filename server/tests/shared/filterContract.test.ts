/**
 * Unit tests for the filter and sort contract in `shared/types/filters`
 * (item 38).
 *
 * The contract declares each list's filter fields (kind, modifiers, default
 * modifier, hierarchy), its sorts and default sort, and the filter-panel keys
 * that name those fields. The server's parser and the client's options both
 * read it, so these checks keep the tables consistent with themselves.
 */
import {
  CLIP_PARAMS,
  DEFAULT_SORT,
  FIELDS,
  type FieldSpec,
  LIST_KINDS,
  type ListKind,
  PANEL_FIELDS,
  PLAYLIST_ITEM_SORTS,
  type PanelField,
  SCENE_FIELDS,
  SORTS,
  UI_KEYS,
} from "@peek/shared-types/filters/index.js";
import { describe, expect, it } from "vitest";

const TABLES: Record<ListKind, Readonly<Record<string, FieldSpec>>> = {
  ...FIELDS,
  clip: CLIP_PARAMS,
};

/** Every field of every table, named `<list>.<field>` */
const allFields = (): [string, FieldSpec][] =>
  LIST_KINDS.flatMap((kind) =>
    Object.entries(TABLES[kind]).map(([name, spec]): [string, FieldSpec] => [
      `${kind}.${name}`,
      spec,
    ])
  );

describe("filter contract", () => {
  it("every default modifier is one of its field's modifiers", () => {
    const wrong = allFields().flatMap(([name, spec]) => {
      if (!("modifiers" in spec)) return [];
      const modifiers: readonly string[] = spec.modifiers;
      return modifiers.length > 0 && modifiers.includes(spec.defaultModifier)
        ? []
        : [name];
    });

    expect(wrong).toEqual([]);
  });

  it("single-valued ref fields offer no INCLUDES_ALL", () => {
    const wrong = allFields().flatMap(([name, spec]) => {
      if (spec.kind !== "ref" || !spec.single) return [];
      const modifiers: readonly string[] = spec.modifiers;
      return modifiers.includes("INCLUDES_ALL") ? [name] : [];
    });

    expect(wrong).toEqual([]);
  });

  it("excludable fields are refs: the tags, performers and studios of the seven lists", () => {
    const excludable = allFields().flatMap(([name, spec]) =>
      spec.kind === "ref" && spec.excludable ? [name] : []
    );
    const notRefs = allFields().flatMap(([name, spec]) =>
      Object.prototype.hasOwnProperty.call(spec, "excludable") &&
      spec.kind !== "ref"
        ? [name]
        : []
    );
    const expected = Object.entries(FIELDS).flatMap(([kind, fields]) =>
      Object.entries(fields).flatMap(([field, spec]: [string, FieldSpec]) =>
        spec.kind === "ref" && ["tags", "performers", "studios"].includes(field)
          ? [`${kind}.${field}`]
          : []
      )
    );

    expect(notRefs).toEqual([]);
    expect(excludable).toEqual(expected);
    expect(excludable).toContain("tag.performers");
  });

  it("ref presence (has none, has any) is on the relations a row can lack", () => {
    const presence = allFields().flatMap(([name, spec]) => {
      if (spec.kind !== "ref") return [];
      const modifiers: readonly string[] = spec.modifiers;
      return modifiers.includes("IS_NULL") && modifiers.includes("NOT_NULL")
        ? [name]
        : [];
    });

    expect(presence.sort()).toEqual(
      [
        "scene.performers",
        "scene.tags",
        "scene.studios",
        "scene.groups",
        "scene.galleries",
        "image.performers",
        "image.tags",
        "image.studios",
        "image.galleries",
        "gallery.performers",
        "gallery.tags",
        "gallery.studios",
        "gallery.scenes",
        "performer.tags",
        "studio.tags",
        "group.tags",
        "group.studios",
      ].sort()
    );
  });

  it("scene.playlists is the one playlist field: ref modifiers, no presence, at most 100 ids", () => {
    const playlistFields = allFields().flatMap(([name, spec]) =>
      spec.kind === "playlist" ? [name] : []
    );

    expect(playlistFields).toEqual(["scene.playlists"]);
    expect(SCENE_FIELDS.playlists).toEqual({
      kind: "playlist",
      modifiers: ["INCLUDES", "INCLUDES_ALL", "EXCLUDES"],
      defaultModifier: "INCLUDES",
      maxValues: 100,
    });
    expect(SCENE_FIELDS.in_any_playlist).toEqual({ kind: "boolean" });
  });

  it("Playlist order is a scene sort the playlist items page leaves out", () => {
    const scene: readonly string[] = SORTS.scene;
    const items: readonly string[] = PLAYLIST_ITEM_SORTS;

    expect(scene).toContain("playlist_position");
    expect(items).not.toContain("playlist_position");
  });

  it("each sort list has no duplicates and holds its default sort", () => {
    const wrong = LIST_KINDS.flatMap((kind) => {
      const sorts: readonly string[] = SORTS[kind];
      const problems: string[] = [];
      if (new Set(sorts).size !== sorts.length) {
        problems.push(`${kind}: duplicate sort`);
      }
      if (!sorts.includes(DEFAULT_SORT[kind].field)) {
        problems.push(`${kind}: default ${DEFAULT_SORT[kind].field} missing`);
      }
      return problems;
    });

    expect(wrong).toEqual([]);
  });

  it("every UI key names a field of its entity", () => {
    const wrong = LIST_KINDS.flatMap((kind) => {
      const fields = Object.keys(TABLES[kind]);
      return UI_KEYS[kind]
        .filter((uiKey) => !fields.includes(uiKey.field))
        .map((uiKey) => `${kind}.${uiKey.key} -> ${uiKey.field}`);
    });

    expect(wrong).toEqual([]);
  });
});

/**
 * Today's (v3.4.0-beta.7) panel keys with their companions: links, presets
 * and stored carousels name them, so every one must stay in the projection
 * of the panel table (new entries and companions may be added; a field may
 * be renamed)
 */
const BETA7_UI_KEYS: Record<
  ListKind,
  readonly { key: string; modifierKey?: string; hierarchyKey?: string }[]
> = {
  scene: [
    { key: "title" },
    { key: "details" },
    { key: "performerIds", modifierKey: "performerIdsModifier" },
    { key: "studioId", hierarchyKey: "studioIdDepth" },
    {
      key: "tagIds",
      modifierKey: "tagIdsModifier",
      hierarchyKey: "tagIdsDepth",
    },
    { key: "groupIds", modifierKey: "groupIdsModifier" },
    { key: "rating" },
    { key: "oCount" },
    { key: "duration" },
    { key: "favorite" },
    { key: "performerFavorite" },
    { key: "studioFavorite" },
    { key: "tagFavorite" },
    { key: "date" },
    { key: "createdAt" },
    { key: "updatedAt" },
    { key: "lastPlayedAt" },
    { key: "resolution", modifierKey: "resolutionModifier" },
    { key: "bitrate" },
    { key: "framerate" },
    { key: "orientation" },
    { key: "videoCodec" },
    { key: "audioCodec" },
    { key: "director" },
    { key: "playDuration" },
    { key: "playCount" },
    { key: "performerCount" },
    { key: "performerAge" },
    { key: "tagCount" },
  ],
  performer: [
    { key: "name" },
    {
      key: "tagIds",
      modifierKey: "tagIdsModifier",
      hierarchyKey: "tagIdsDepth",
    },
    { key: "gender" },
    { key: "rating" },
    { key: "oCounter" },
    { key: "sceneCount" },
    { key: "favorite" },
    { key: "age" },
    { key: "birthYear" },
    { key: "deathYear" },
    { key: "careerLength" },
    { key: "birthdate" },
    { key: "deathDate" },
    { key: "createdAt" },
    { key: "updatedAt" },
    { key: "hairColor" },
    { key: "eyeColor" },
    { key: "ethnicity" },
    { key: "fakeTits" },
    { key: "measurements" },
    { key: "tattoos" },
    { key: "piercings" },
    { key: "height" },
    { key: "weight" },
    { key: "penisLength" },
    { key: "playCount" },
    { key: "details" },
  ],
  studio: [
    { key: "name" },
    { key: "details" },
    {
      key: "tagIds",
      modifierKey: "tagIdsModifier",
      hierarchyKey: "tagIdsDepth",
    },
    { key: "rating" },
    { key: "sceneCount" },
    { key: "oCounter" },
    { key: "playCount" },
    { key: "favorite" },
    { key: "createdAt" },
    { key: "updatedAt" },
  ],
  tag: [
    { key: "name" },
    { key: "description" },
    { key: "rating" },
    { key: "sceneCount" },
    { key: "oCounter" },
    { key: "playCount" },
    { key: "favorite" },
    { key: "performerIds" },
    { key: "studioId" },
    { key: "groupIds" },
    { key: "createdAt" },
    { key: "updatedAt" },
  ],
  group: [
    { key: "name" },
    { key: "synopsis" },
    { key: "director" },
    { key: "performerIds", modifierKey: "performerIdsModifier" },
    { key: "studioId" },
    { key: "tagIds", modifierKey: "tagIdsModifier" },
    { key: "rating" },
    { key: "sceneCount" },
    { key: "duration" },
    { key: "favorite" },
    { key: "date" },
    { key: "createdAt" },
    { key: "updatedAt" },
    { key: "groupIds" },
  ],
  gallery: [
    { key: "title" },
    { key: "performerIds", modifierKey: "performerIdsModifier" },
    {
      key: "studioIds",
      modifierKey: "studioIdsModifier",
      hierarchyKey: "studioIdsDepth",
    },
    {
      key: "tagIds",
      modifierKey: "tagIdsModifier",
      hierarchyKey: "tagIdsDepth",
    },
    { key: "rating" },
    { key: "imageCount" },
    { key: "tagCount" },
    { key: "favorite" },
    { key: "hasFavoriteImage" },
  ],
  image: [
    { key: "performerIds", modifierKey: "performerIdsModifier" },
    {
      key: "studioIds",
      modifierKey: "studioIdsModifier",
      hierarchyKey: "studioIdsDepth",
    },
    {
      key: "tagIds",
      modifierKey: "tagIdsModifier",
      hierarchyKey: "tagIdsDepth",
    },
    { key: "galleryIds", modifierKey: "galleryIdsModifier" },
    { key: "rating" },
    { key: "favorite" },
    { key: "oCounter" },
    { key: "tagCount" },
  ],
  clip: [
    { key: "tagIds", modifierKey: "tagIdsModifier" },
    { key: "sceneTagIds", modifierKey: "sceneTagIdsModifier" },
    { key: "performerIds", modifierKey: "performerIdsModifier" },
    { key: "studioId" },
    { key: "isGenerated" },
  ],
};

/** A key with its companions, as a comparable line */
const describeKey = (uiKey: {
  key: string;
  modifierKey?: string;
  hierarchyKey?: string;
}) =>
  `${uiKey.key} modifier=${uiKey.modifierKey ?? "-"} hierarchy=${uiKey.hierarchyKey ?? "-"}`;

/** A list's panel rows, widened to the row type */
const panelOf = (kind: ListKind): readonly PanelField[] => PANEL_FIELDS[kind];

describe("filter panel keys", () => {
  it("UI_KEYS is the panel table's projection", () => {
    for (const kind of LIST_KINDS) {
      const projected = panelOf(kind).map((field) => ({
        key: field.key,
        field: field.field,
        ...(field.modifierKey ? { modifierKey: field.modifierKey } : {}),
        ...(field.hierarchyKey ? { hierarchyKey: field.hierarchyKey } : {}),
      }));
      expect(UI_KEYS[kind]).toEqual(projected);
    }
  });

  it("every v3.4.0-beta.7 UI key is still in the panel table's projection", () => {
    const missing = LIST_KINDS.flatMap((kind) => {
      const now = new Set(panelOf(kind).map((field) => describeKey(field)));
      return BETA7_UI_KEYS[kind]
        .map(describeKey)
        .filter((line) => !now.has(line))
        .map((line) => `${kind}.${line}`);
    });

    expect(missing).toEqual([]);
  });
});
