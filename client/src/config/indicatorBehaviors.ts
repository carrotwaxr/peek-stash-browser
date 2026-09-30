import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "@peek/shared-types";
import type { getFilteredListPath } from "../utils/entityLinks";

/**
 * Indicator behavior configuration
 *
 * Future: This will be sourced from user settings in the database.
 * Users will be able to customize behavior per card type per relationship.
 *
 * Behaviors:
 * - 'rich': Show TooltipEntityGrid with entity previews
 * - 'nav': Count + click navigates to filtered list
 * - 'count': Count only, no interaction
 */

export const INDICATOR_BEHAVIORS = {
  scene: {
    performers: "rich",
    tags: "rich",
    studios: "rich",
    groups: "rich",
    galleries: "rich",
    scenes: "count",
    images: "count",
  },
  image: {
    performers: "rich",
    tags: "rich",
    studios: "rich",
    groups: "rich",
    galleries: "rich",
    scenes: "count",
    images: "count",
  },
  gallery: {
    performers: "rich",
    tags: "rich",
    studios: "rich",
    groups: "rich",
    galleries: "count",
    scenes: "nav",
    images: "nav",
  },
  performer: {
    performers: "count",
    tags: "rich",
    studios: "rich",
    groups: "rich",
    galleries: "rich",
    scenes: "nav",
    images: "nav",
  },
  tag: {
    performers: "rich",
    tags: "count",
    studios: "rich",
    groups: "rich",
    galleries: "rich",
    scenes: "nav",
    images: "nav",
  },
  studio: {
    performers: "nav",
    tags: "rich",
    studios: "count",
    groups: "rich",
    galleries: "rich",
    scenes: "nav",
    images: "nav",
  },
  group: {
    performers: "rich",
    tags: "rich",
    studios: "rich",
    // The sub-collections count opens them
    groups: "nav",
    galleries: "rich",
    scenes: "nav",
    images: "nav",
  },
  clip: {
    performers: "rich",
    tags: "rich",
    studios: "rich",
    groups: "rich",
    galleries: "rich",
    scenes: "nav",
    images: "nav",
  },
};

/**
 * Get indicator behavior for a card type and relationship
 * @param {string} cardType - The card type (scene, performer, tag, etc.)
 * @param {string} relationshipType - The relationship (performers, tags, etc.)
 * @returns {'rich'|'nav'|'count'} The behavior for this indicator
 */
export function getIndicatorBehavior(
  cardType: string,
  relationshipType: string
) {
  return (
    (INDICATOR_BEHAVIORS as Record<string, Record<string, string>>)[cardType]?.[
      relationshipType
    ] ?? "count"
  );
}

/** A relationship a card counts, as `INDICATOR_BEHAVIORS` names it */
type Relationship = keyof (typeof INDICATOR_BEHAVIORS)["scene"];

/**
 * One count on a card. Its behavior (`INDICATOR_BEHAVIORS[card][relationship]`)
 * decides what it does: "rich" shows `tooltip`'s grid on hover, "nav" opens
 * `link`, "count" only counts.
 */
export interface CardIndicatorSpec<E> {
  /** The indicator's type: its icon and label in `CardCountIndicators` */
  type: string;
  count: (entity: E) => number | undefined;
  relationship?: Relationship;
  /** A fixed tooltip text, for a count with no relationship */
  tooltipText?: string;
  /** The count's tooltip text, in place of its type's label */
  countLabel?: (count: number) => string;
  /** The grid a "rich" count shows, when there is anything to show */
  tooltip?: {
    entityType: string;
    title: string;
    entities: (entity: E) => readonly unknown[] | undefined;
    /** How many there are, when the row holds only some */
    total?: (entity: E) => number | undefined;
  };
  /** The list a "nav" count opens: that page's filter on the card's entity */
  link?: {
    page: Parameters<typeof getFilteredListPath>[0];
    filter: Parameters<typeof getFilteredListPath>[1];
  };
}

/** A card's counts, in the order it shows them */
export interface CardIndicatorTable<E> {
  indicators: CardIndicatorSpec<E>[];
  /**
   * What the tooltips and links name (their instance, and the list's filter
   * value): the entity itself unless given
   */
  owner?: (entity: E) => { id?: string; instanceId?: string | undefined };
  /** Leave out a count of zero (the card shows no indicator row for none) */
  omitEmpty?: boolean;
}

// Rows from the list endpoints can lack a relation their type declares, so
// the table reads them through these
const lengthOf = (list: readonly unknown[] | null | undefined) =>
  list?.length ?? 0;
const listOf = <T>(list: readonly T[] | null | undefined): readonly T[] =>
  list ?? [];
const totalOf = <K extends string>(
  totals: Partial<Record<K, number>> | null | undefined,
  key: K
) => totals?.[key];

const playCount = <E extends { play_count?: number }>(
  tooltipText?: string
): CardIndicatorSpec<E> => ({
  type: "PLAY_COUNT",
  count: (e) => e.play_count,
  ...(tooltipText ? { tooltipText } : {}),
});

/** A scene's tags: its own and the ones it inherits, each once */
export const sceneTags = (scene: NormalizedScene) => {
  const tags = new Map<string, { id: string; name: string }>();
  for (const tag of [...listOf(scene.tags), ...listOf(scene.inheritedTags)]) {
    tags.set(tag.id, tag);
  }
  return [...tags.values()];
};

/** The effective relations an image card counts (its own or its galleries') */
export interface ImageIndicatorRow {
  instanceId: string;
  galleries: readonly unknown[];
  performers: readonly unknown[];
  tags: readonly unknown[];
}

/** The fields a clip card counts */
export interface ClipIndicatorRow {
  sceneId: string;
  primaryTag?: { id: string; name: string } | null;
  tags?: Array<{ id: string; name: string }>;
  scene?: { instanceId?: string } | null;
}

/** A clip's tags: its primary tag and the rest, each once */
export const clipTags = (clip: ClipIndicatorRow) => {
  const tags = new Map<string, { id: string; name: string }>();
  if (clip.primaryTag) tags.set(clip.primaryTag.id, clip.primaryTag);
  clip.tags?.forEach((tag) => tags.set(tag.id, tag));
  return [...tags.values()];
};

/** The counts each card shows (LG-R4): one table, one builder (`useCardIndicators`) */
export const CARD_INDICATORS: {
  scene: CardIndicatorTable<NormalizedScene>;
  image: CardIndicatorTable<ImageIndicatorRow>;
  gallery: CardIndicatorTable<NormalizedGallery>;
  performer: CardIndicatorTable<NormalizedPerformer>;
  studio: CardIndicatorTable<NormalizedStudio>;
  tag: CardIndicatorTable<NormalizedTag>;
  group: CardIndicatorTable<NormalizedGroup>;
  clip: CardIndicatorTable<ClipIndicatorRow>;
} = {
  scene: {
    indicators: [
      playCount("Times watched"),
      {
        type: "PERFORMERS",
        relationship: "performers",
        count: (s) => lengthOf(s.performers),
        tooltip: {
          entityType: "performer",
          title: "Performers",
          entities: (s) => s.performers,
        },
        link: { page: "/performers", filter: "scenes" },
      },
      {
        type: "GROUPS",
        relationship: "groups",
        count: (s) => lengthOf(s.groups),
        tooltip: {
          entityType: "group",
          title: "Collections",
          entities: (s) => s.groups,
        },
        link: { page: "/collections", filter: "scenes" },
      },
      {
        type: "GALLERIES",
        relationship: "galleries",
        count: (s) => lengthOf(s.galleries),
        tooltip: {
          entityType: "gallery",
          title: "Galleries",
          entities: (s) => s.galleries,
        },
        link: { page: "/galleries", filter: "scenes" },
      },
      {
        type: "TAGS",
        relationship: "tags",
        count: (s) => sceneTags(s).length,
        tooltip: { entityType: "tag", title: "Tags", entities: sceneTags },
        link: { page: "/tags", filter: "scenes" },
      },
    ],
  },
  image: {
    omitEmpty: true,
    indicators: [
      {
        type: "GALLERIES",
        relationship: "galleries",
        count: (i) => i.galleries.length,
        tooltip: {
          entityType: "gallery",
          title: "Galleries",
          entities: (i) => i.galleries,
        },
      },
      {
        type: "PERFORMERS",
        relationship: "performers",
        count: (i) => i.performers.length,
        tooltip: {
          entityType: "performer",
          title: "Performers",
          entities: (i) => i.performers,
        },
      },
      {
        type: "TAGS",
        relationship: "tags",
        count: (i) => i.tags.length,
        tooltip: { entityType: "tag", title: "Tags", entities: (i) => i.tags },
      },
    ],
  },
  gallery: {
    indicators: [
      {
        type: "IMAGES",
        relationship: "images",
        count: (g) => g.image_count,
        link: { page: "/images", filter: "galleries" },
      },
      {
        type: "SCENES",
        relationship: "scenes",
        // The scenes the viewer can see, counted by the server: list rows
        // carry no scene list
        count: (g) =>
          totalOf(g.relation_totals, "scenes") ?? lengthOf(g.scenes),
        tooltip: {
          entityType: "scene",
          title: "Scenes",
          entities: (g) => g.scenes,
        },
        link: { page: "/scenes", filter: "galleries" },
      },
      {
        type: "PERFORMERS",
        relationship: "performers",
        count: (g) => lengthOf(g.performers),
        tooltip: {
          entityType: "performer",
          title: "Performers",
          entities: (g) => g.performers,
        },
        link: { page: "/performers", filter: "galleries" },
      },
      {
        type: "TAGS",
        relationship: "tags",
        count: (g) => lengthOf(g.tags),
        tooltip: { entityType: "tag", title: "Tags", entities: (g) => g.tags },
        link: { page: "/tags", filter: "galleries" },
      },
    ],
  },
  performer: {
    indicators: [
      playCount(),
      {
        type: "SCENES",
        relationship: "scenes",
        count: (p) => p.scene_count,
        link: { page: "/scenes", filter: "performers" },
      },
      {
        type: "GROUPS",
        relationship: "groups",
        count: (p) =>
          p.relation_totals?.groups ?? p.groups?.length ?? p.group_count,
        tooltip: {
          entityType: "group",
          title: "Collections",
          entities: (p) => p.groups,
          total: (p) => p.relation_totals?.groups,
        },
      },
      {
        type: "IMAGES",
        relationship: "images",
        count: (p) => p.image_count,
        link: { page: "/images", filter: "performers" },
      },
      {
        type: "GALLERIES",
        relationship: "galleries",
        count: (p) =>
          p.relation_totals?.galleries ??
          p.galleries?.length ??
          p.gallery_count,
        tooltip: {
          entityType: "gallery",
          title: "Galleries",
          entities: (p) => p.galleries,
          total: (p) => p.relation_totals?.galleries,
        },
      },
      {
        type: "TAGS",
        relationship: "tags",
        count: (p) => lengthOf(p.tags),
        tooltip: { entityType: "tag", title: "Tags", entities: (p) => p.tags },
      },
      {
        type: "STUDIOS",
        relationship: "studios",
        count: (p) => p.relation_totals?.studios ?? p.studios?.length ?? 0,
        tooltip: {
          entityType: "studio",
          title: "Studios",
          entities: (p) => p.studios,
          total: (p) => p.relation_totals?.studios,
        },
      },
    ],
  },
  studio: {
    indicators: [
      playCount(),
      {
        type: "SCENES",
        relationship: "scenes",
        count: (s) => s.scene_count,
        link: { page: "/scenes", filter: "studios" },
      },
      {
        type: "IMAGES",
        relationship: "images",
        count: (s) => s.image_count,
        link: { page: "/images", filter: "studios" },
      },
      {
        type: "GALLERIES",
        relationship: "galleries",
        count: (s) =>
          s.relation_totals?.galleries ??
          s.galleries?.length ??
          s.gallery_count,
        tooltip: {
          entityType: "gallery",
          title: "Galleries",
          entities: (s) => s.galleries,
          total: (s) => s.relation_totals?.galleries,
        },
      },
      {
        type: "GROUPS",
        relationship: "groups",
        count: (s) =>
          s.relation_totals?.groups ?? s.groups?.length ?? s.group_count,
        tooltip: {
          entityType: "group",
          title: "Collections",
          entities: (s) => s.groups,
          total: (s) => s.relation_totals?.groups,
        },
      },
      {
        type: "PERFORMERS",
        relationship: "performers",
        count: (s) =>
          s.relation_totals?.performers ??
          s.performers?.length ??
          s.performer_count,
        tooltip: {
          entityType: "performer",
          title: "Performers",
          entities: (s) => s.performers,
          total: (s) => s.relation_totals?.performers,
        },
      },
      {
        type: "TAGS",
        relationship: "tags",
        count: (s) => lengthOf(s.tags),
        tooltip: { entityType: "tag", title: "Tags", entities: (s) => s.tags },
      },
    ],
  },
  tag: {
    indicators: [
      playCount(),
      {
        type: "SCENES",
        relationship: "scenes",
        count: (t) => t.scene_count,
        link: { page: "/scenes", filter: "tags" },
      },
      {
        type: "IMAGES",
        relationship: "images",
        count: (t) => t.image_count,
        link: { page: "/images", filter: "tags" },
      },
      {
        type: "GALLERIES",
        relationship: "galleries",
        count: (t) =>
          t.relation_totals?.galleries ??
          t.galleries?.length ??
          t.gallery_count,
        tooltip: {
          entityType: "gallery",
          title: "Galleries",
          entities: (t) => t.galleries,
          total: (t) => t.relation_totals?.galleries,
        },
      },
      {
        type: "GROUPS",
        relationship: "groups",
        count: (t) =>
          t.relation_totals?.groups ?? t.groups?.length ?? t.group_count,
        tooltip: {
          entityType: "group",
          title: "Collections",
          entities: (t) => t.groups,
          total: (t) => t.relation_totals?.groups,
        },
      },
      {
        type: "STUDIOS",
        relationship: "studios",
        count: (t) =>
          t.relation_totals?.studios ?? t.studios?.length ?? t.studio_count,
        tooltip: {
          entityType: "studio",
          title: "Studios",
          entities: (t) => t.studios,
          total: (t) => t.relation_totals?.studios,
        },
      },
      {
        type: "PERFORMERS",
        relationship: "performers",
        count: (t) =>
          t.relation_totals?.performers ??
          t.performers?.length ??
          t.performer_count,
        tooltip: {
          entityType: "performer",
          title: "Performers",
          entities: (t) => t.performers,
          total: (t) => t.relation_totals?.performers,
        },
      },
    ],
  },
  group: {
    indicators: [
      {
        type: "SCENES",
        relationship: "scenes",
        count: (g) => g.scene_count,
        link: { page: "/scenes", filter: "groups" },
      },
      {
        // On the Collections page the collection filter is "Parent
        // collection", so this lists the collection's sub-collections
        type: "GROUPS",
        relationship: "groups",
        count: (g) => g.sub_group_count,
        countLabel: (count) =>
          count === 1 ? "1 sub-collection" : `${count} sub-collections`,
        link: { page: "/collections", filter: "groups" },
      },
      {
        type: "PERFORMERS",
        relationship: "performers",
        count: (g) =>
          g.relation_totals?.performers ??
          g.performers?.length ??
          g.performer_count,
        tooltip: {
          entityType: "performer",
          title: "Performers",
          entities: (g) => g.performers,
          total: (g) => g.relation_totals?.performers,
        },
      },
      {
        type: "GALLERIES",
        relationship: "galleries",
        count: (g) => g.relation_totals?.galleries ?? g.galleries?.length ?? 0,
        tooltip: {
          entityType: "gallery",
          title: "Galleries",
          entities: (g) => g.galleries,
          total: (g) => g.relation_totals?.galleries,
        },
      },
      {
        type: "TAGS",
        relationship: "tags",
        count: (g) => lengthOf(g.tags),
        tooltip: { entityType: "tag", title: "Tags", entities: (g) => g.tags },
      },
    ],
  },
  clip: {
    // A clip's tags open the Tags list on its scene
    owner: (c) => ({ id: c.sceneId, instanceId: c.scene?.instanceId }),
    indicators: [
      {
        type: "TAGS",
        relationship: "tags",
        count: (c) => clipTags(c).length,
        tooltip: { entityType: "tag", title: "Tags", entities: clipTags },
        link: { page: "/tags", filter: "scenes" },
      },
    ],
  },
};
