/**
 * The lists a card's counts open (FILTERS-11). A count opens a list page
 * filtered to the card's entity, on its instance, through a filter the page
 * declares; a count whose page has no filter for that entity opens nothing,
 * rather than an unfiltered list. Each link is read back with the page's own
 * filter options, as `useFilterState` reads it on arrival. GalleryCard's
 * links are in GalleryCard.test.tsx.
 */
import type { ReactElement } from "react";
import type * as routerModule from "react-router-dom";
import type {
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "@peek/shared-types";
import { render } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClipCard, { type Clip } from "../../../src/components/cards/ClipCard";
import GroupCard from "../../../src/components/cards/GroupCard";
import PerformerCard from "../../../src/components/cards/PerformerCard";
import StudioCard from "../../../src/components/cards/StudioCard";
import TagCard from "../../../src/components/cards/TagCard";
import type { BaseCardProps } from "../../../src/components/ui/BaseCard";
import SceneCard from "../../../src/components/ui/SceneCard";
import {
  type FilterOption,
  GALLERY_FILTER_OPTIONS,
  GROUP_FILTER_OPTIONS,
  IMAGE_FILTER_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  SCENE_FILTER_OPTIONS,
  TAG_FILTER_OPTIONS,
} from "../../../src/utils/filterConfig";
import { parseSearchParams } from "../../../src/utils/urlParams";

const { navigate, baseCardProps } = vi.hoisted(() => ({
  navigate: vi.fn<(to: string) => void>(),
  baseCardProps: vi.fn<(props: BaseCardProps) => void>(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof routerModule>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: true }),
}));
vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({ showRelationshipIndicators: true }),
  }),
}));
vi.mock("../../../src/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));
// Every count set to open a list, as a user's settings could; by default
// most relationship counts show a tooltip instead
vi.mock("../../../src/config/indicatorBehaviors", () => ({
  getIndicatorBehavior: () => "nav",
}));
// Captures the indicators each card hands to BaseCard
vi.mock("../../../src/components/ui/BaseCard", () => {
  const BaseCard = (props: BaseCardProps) => {
    baseCardProps(props);
    return null;
  };
  return { BaseCard, default: BaseCard };
});
vi.mock("../../../src/components/ui/index", () => ({
  SceneCardPreview: () => null,
  TooltipEntityGrid: () => null,
}));

/** The filters each list page declares, as its SearchControls reads them */
const PAGE_OPTIONS: Record<string, readonly FilterOption[]> = {
  "/scenes": SCENE_FILTER_OPTIONS,
  "/images": IMAGE_FILTER_OPTIONS,
  "/performers": PERFORMER_FILTER_OPTIONS,
  "/tags": TAG_FILTER_OPTIONS,
  "/collections": GROUP_FILTER_OPTIONS,
  "/galleries": GALLERY_FILTER_OPTIONS,
};

const one = [{ id: "1", name: "One" }];

const performer = {
  id: "82",
  instanceId: "inst-a",
  name: "P",
  scene_count: 3,
  image_count: 2,
} as NormalizedPerformer;
const studio = {
  id: "3",
  instanceId: "inst-a",
  name: "S",
  scene_count: 3,
  image_count: 2,
} as NormalizedStudio;
const tag = {
  id: "5",
  instanceId: "inst-a",
  name: "T",
  scene_count: 3,
  image_count: 2,
} as NormalizedTag;
const group = {
  id: "7",
  instanceId: "inst-a",
  name: "G",
  scene_count: 3,
  sub_group_count: 2,
  tags: [],
} as unknown as NormalizedGroup;
const scene = {
  id: "40",
  instanceId: "inst-a",
  title: "Scene",
  paths: { screenshot: null },
  files: [],
  performers: one,
  groups: one,
  galleries: one,
  tags: one,
} as unknown as NormalizedScene;
const clip: Clip = {
  id: "c1",
  sceneId: "40",
  tags: one,
  scene: { instanceId: "inst-a" },
};

interface Link {
  /** The card, for the test's name */
  card: string;
  element: ReactElement;
  /** The count's indicator type */
  count: string;
  /** The list page the count would open */
  page: string;
  /** The card's entity type, as the page's filter options name it */
  entityType: string;
  id: string;
}

const LINKS: Link[] = [
  ...(["SCENES", "IMAGES"] as const).flatMap((count) => [
    {
      card: "performer",
      element: <PerformerCard performer={performer} />,
      count,
      page: count === "SCENES" ? "/scenes" : "/images",
      entityType: "performers",
      id: "82",
    },
    {
      card: "studio",
      element: <StudioCard studio={studio} />,
      count,
      page: count === "SCENES" ? "/scenes" : "/images",
      entityType: "studios",
      id: "3",
    },
    {
      card: "tag",
      element: <TagCard tag={tag} />,
      count,
      page: count === "SCENES" ? "/scenes" : "/images",
      entityType: "tags",
      id: "5",
    },
  ]),
  ...(
    [
      ["SCENES", "/scenes"],
      ["GROUPS", "/collections"],
    ] as const
  ).map(([count, page]) => ({
    card: "group",
    element: <GroupCard group={group} />,
    count,
    page,
    entityType: "groups",
    id: "7",
  })),
  ...(
    [
      ["PERFORMERS", "/performers"],
      ["GROUPS", "/collections"],
      ["GALLERIES", "/galleries"],
      ["TAGS", "/tags"],
    ] as const
  ).map(([count, page]) => ({
    card: "scene",
    element: <SceneCard scene={scene} />,
    count,
    page,
    entityType: "scenes",
    id: "40",
  })),
  {
    card: "clip",
    element: <ClipCard clip={clip} />,
    count: "TAGS",
    page: "/tags",
    entityType: "scenes",
    id: "40",
  },
];

describe("card indicator links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(LINKS)(
    "the $card card's $count count opens $page only through its filter for $entityType",
    ({ element, count, page, entityType, id }) => {
      render(element);
      const props = must(baseCardProps.mock.lastCall, "BaseCard's props")[0];
      const { onClick } = must(
        props.indicators?.find((each) => each.type === count),
        `the ${count} indicator`
      );
      const options = must(PAGE_OPTIONS[page], `${page}'s filter options`);
      const option = options.find(
        (each) =>
          each.type === "searchable-select" && each.entityType === entityType
      );

      // Where the count goes, and what the page's filter reads there
      let opened: { page: string; value: unknown } | undefined;
      if (onClick) {
        onClick();
        const url = new URL(
          must(navigate.mock.lastCall, "a navigation")[0],
          "http://peek.test"
        );
        const { filters } = parseSearchParams(url.searchParams, [...options]);
        opened = { page: url.pathname, value: filters[option?.key ?? ""] };
      }

      const ref = `${id}:inst-a`;
      expect(opened).toEqual(
        option && { page, value: option.multi ? [ref] : ref }
      );
    }
  );

  it("the tag card's scenes count opens the Scenes page filtered to that tag on its instance", () => {
    render(<TagCard tag={tag} />);
    const props = must(baseCardProps.mock.lastCall, "BaseCard's props")[0];
    const scenes = must(
      props.indicators?.find((each) => each.type === "SCENES"),
      "the SCENES indicator"
    );
    must(scenes.onClick, "the scenes link")();

    expect(navigate).toHaveBeenCalledWith("/scenes?tagId=5&instance=inst-a");
  });
});
