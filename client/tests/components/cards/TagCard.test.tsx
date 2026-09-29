import { createElement } from "react";
import type * as routerModule from "react-router-dom";
import { MemoryRouter } from "react-router-dom";
import type { NormalizedTag, PerformerRef } from "@peek/shared-types";
import { render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TagCard from "../../../src/components/cards/TagCard";
import type { BaseCardProps } from "../../../src/components/ui/BaseCard";

const { baseCardProps } = vi.hoisted(() => ({
  baseCardProps: vi.fn<(props: BaseCardProps) => void>(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof routerModule>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({ showRelationshipIndicators: true }),
  }),
}));
// Captures the indicators the card hands to BaseCard
vi.mock("../../../src/components/ui/BaseCard", () => ({
  BaseCard: (props: BaseCardProps) => {
    baseCardProps(props);
    return null;
  },
}));

/** The indicator of one type from the card's last render */
const indicator = (type: string) => {
  const props = must(baseCardProps.mock.lastCall, "BaseCard's props")[0];
  return must(
    props.indicators?.find((each) => each.type === type),
    `the ${type} indicator`
  );
};

/** Shows an indicator's tooltip grid */
const renderTooltip = (type: string) =>
  render(<MemoryRouter>{indicator(type).tooltipContent}</MemoryRouter>);

/** TagCard renders from these fields; the rest are left out */
const partialTag = (fields: Partial<NormalizedTag>) => fields as NormalizedTag;

describe("TagCard", () => {
  const mockTag = {
    id: "1",
    name: "Test Tag",
    image_path: "/tag.jpg",
    scene_count: 30,
    studio_count: 5,
    performer_count: 10,
    gallery_count: 8,
    description: "Tag description",
  };

  it("is a React forwardRef component", () => {
    expect(typeof TagCard).toBe("object");
    expect(TagCard.displayName).toBe("TagCard");
  });

  it("accepts expected props", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
      fromPageTitle: "Tags",
      tabIndex: 0,
    } as any);

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
    } as any);

    expect(element.props.tag).toBe(mockTag);
  });

  it("passes correct link path", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
    } as any);

    expect(element.props.tag.id).toBe("1");
  });

  it("passes tag with all data", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
    } as any);

    const tag = element.props.tag;
    expect(tag.name).toBe("Test Tag");
    expect(tag.scene_count).toBe(30);
    expect(tag.description).toBe("Tag description");
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
      fromPageTitle: "Tags",
    } as any);

    expect(element.props.fromPageTitle).toBe("Tags");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(TagCard, {
      tag: mockTag,
      tabIndex: 5,
    } as any);

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(TagCard, {
      tag: mockTag,
      onHideSuccess,
    } as any);

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});

describe("TagCard indicators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const performer = (i: number): PerformerRef => ({
    id: String(i),
    instanceId: "inst-a",
    name: `Performer ${i}`,
    disambiguation: null,
    gender: null,
    image_path: null,
  });

  it("the performers indicator shows relation_totals.performers and its grid says how many more", () => {
    render(
      <TagCard
        tag={partialTag({
          id: "7",
          instanceId: "inst-a",
          name: "Tag",
          scene_count: 0,
          image_count: 0,
          performer_count: 45,
          performers: Array.from({ length: 12 }, (_, i) => performer(i + 1)),
          relation_totals: { performers: 40 },
        })}
      />
    );

    expect(indicator("PERFORMERS").count).toBe(40);
    renderTooltip("PERFORMERS");
    expect(screen.getByText("and 28 more")).toBeInTheDocument();
  });
});
