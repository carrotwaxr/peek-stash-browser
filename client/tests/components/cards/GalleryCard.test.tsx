import { createElement } from "react";
import type * as routerModule from "react-router-dom";
import type { NormalizedGallery } from "@peek/shared-types";
import { render } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GalleryCard from "../../../src/components/cards/GalleryCard";
import type { BaseCardProps } from "../../../src/components/ui/BaseCard";
import type * as indicatorBehaviors from "../../../src/config/indicatorBehaviors";
import {
  IMAGE_FILTER_OPTIONS,
  SCENE_FILTER_OPTIONS,
  buildSceneFilter,
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
// Every count set to open a list, as a user's settings could: scenes and
// images are "nav" by default, performers and tags "rich"
vi.mock("../../../src/config/indicatorBehaviors", async (importOriginal) => ({
  ...(await importOriginal<typeof indicatorBehaviors>()),
  getIndicatorBehavior: () => "nav",
}));
// Captures the indicators GalleryCard hands to BaseCard
vi.mock("../../../src/components/ui/BaseCard", () => ({
  BaseCard: (props: BaseCardProps) => {
    baseCardProps(props);
    return null;
  },
}));

describe("GalleryCard", () => {
  const mockGallery = {
    id: "1",
    title: "Test Gallery",
    cover: "/cover.jpg",
    image_count: 25,
    studio: { name: "Test Studio" },
    date: "2024-01-15",
    performers: [{ id: "1", name: "Performer 1" }],
    tags: [{ id: "1", name: "Tag 1" }],
    rating100: 70,
    favorite: false,
  };

  it("is a React forwardRef component", () => {
    expect(typeof GalleryCard).toBe("object");
    expect(GalleryCard.displayName).toBe("GalleryCard");
  });

  it("accepts expected props", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
      fromPageTitle: "Galleries",
      tabIndex: 0,
    } as any);

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
    } as any);

    expect(element.props.gallery).toBe(mockGallery);
  });

  it("passes correct link path", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
    } as any);

    expect(element.props.gallery.id).toBe("1");
  });

  it("passes gallery with all data", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
    } as any);

    const gallery = element.props.gallery;
    expect(gallery.title).toBe("Test Gallery");
    expect(gallery.image_count).toBe(25);
    expect(gallery.studio!.name).toBe("Test Studio");
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
      fromPageTitle: "Galleries",
    } as any);

    expect(element.props.fromPageTitle).toBe("Galleries");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
      tabIndex: 5,
    } as any);

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(GalleryCard, {
      gallery: mockGallery,
      onHideSuccess,
    } as any);

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});

describe("GalleryCard indicator links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** A gallery on inst-a with something behind every count */
  const renderCard = () => {
    render(
      <GalleryCard
        gallery={
          {
            id: "12",
            instanceId: "inst-a",
            title: "Beach",
            image_count: 25,
            performers: [{ id: "1", name: "P" }],
            tags: [{ id: "1", name: "T" }],
            relation_totals: { scenes: 1 },
          } as NormalizedGallery
        }
      />
    );
    const props = must(baseCardProps.mock.lastCall, "BaseCard's props")[0];
    return (type: string) =>
      must(
        props.indicators?.find((each) => each.type === type),
        `the ${type} indicator`
      );
  };

  it("the images count opens the Images page filtered to the gallery on its instance", () => {
    must(renderCard()("IMAGES").onClick, "the images link")();

    const to = must(navigate.mock.lastCall, "a navigation")[0];
    expect(to).toBe("/images?galleryId=12&instance=inst-a");
    const url = new URL(to, "http://peek.test");
    const { filters } = parseSearchParams(url.searchParams, [
      ...IMAGE_FILTER_OPTIONS,
    ]);
    expect(filters.galleryIds).toEqual(["12:inst-a"]);
  });

  it("the scenes count opens the Scenes page filtered to the gallery on its instance and lists that gallery's scenes", () => {
    must(renderCard()("SCENES").onClick, "the scenes link")();

    const to = must(navigate.mock.lastCall, "a navigation")[0];
    expect(to).toBe("/scenes?galleryId=12&instance=inst-a");
    const url = new URL(to, "http://peek.test");
    const { filters } = parseSearchParams(url.searchParams, [
      ...SCENE_FILTER_OPTIONS,
    ]);
    expect(filters.galleryIds).toEqual(["12:inst-a"]);
    expect(buildSceneFilter(filters).galleries).toEqual({
      value: ["12:inst-a"],
      modifier: "INCLUDES",
    });
  });

  it.each(["PERFORMERS", "TAGS"])(
    "the %s count opens nothing: that list page has no gallery filter",
    (type) => {
      expect(renderCard()(type).onClick).toBeUndefined();
    }
  );
});

describe("GalleryCard scenes count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts the scenes the viewer can see from relation_totals: gallery rows carry no scene list", () => {
    render(
      <GalleryCard
        // A list row as the server sends it: no `scenes` list, which the
        // type still declares
        gallery={untrusted({
          id: "12",
          instanceId: "inst-a",
          title: "Beach",
          image_count: 25,
          performers: [],
          tags: [],
          relation_totals: { scenes: 3 },
        })}
      />
    );

    const props = must(baseCardProps.mock.lastCall, "BaseCard's props")[0];
    const scenes = must(
      props.indicators?.find((each) => each.type === "SCENES"),
      "the scenes indicator"
    );
    expect(scenes.count).toBe(3);
    // A count of scenes links to the Scenes page's gallery filter
    expect(scenes.onClick).toBeDefined();
  });
});
