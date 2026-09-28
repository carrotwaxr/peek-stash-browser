import { createElement } from "react";
import type * as routerModule from "react-router-dom";
import { MemoryRouter } from "react-router-dom";
import type { NormalizedStudio } from "@peek/shared-types";
import { render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudioCard from "../../../src/components/cards/StudioCard";
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

/** StudioCard renders from these fields; the rest are left out */
const partialStudio = (fields: Partial<NormalizedStudio>) =>
  fields as NormalizedStudio;

describe("StudioCard", () => {
  const mockStudio = {
    id: "1",
    name: "Test Studio",
    image_path: "/studio.jpg",
    scene_count: 50,
    tags: [{ id: "1", name: "Tag 1" }],
    details: "Studio description",
    rating100: 90,
    favorite: false,
  };

  it("is a React forwardRef component", () => {
    expect(typeof StudioCard).toBe("object");
    expect(StudioCard.displayName).toBe("StudioCard");
  });

  it("accepts expected props", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
      fromPageTitle: "Studios",
      tabIndex: 0,
    } as any);

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
    } as any);

    expect(element.props.studio).toBe(mockStudio);
  });

  it("passes correct link path", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
    } as any);

    expect(element.props.studio.id).toBe("1");
  });

  it("passes studio with all data", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
    } as any);

    const studio = element.props.studio;
    expect(studio.name).toBe("Test Studio");
    expect(studio.scene_count).toBe(50);
    expect(studio.details).toBe("Studio description");
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
      fromPageTitle: "Studios",
    } as any);

    expect(element.props.fromPageTitle).toBe("Studios");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(StudioCard, {
      studio: mockStudio,
      tabIndex: 5,
    } as any);

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(StudioCard, {
      studio: mockStudio,
      onHideSuccess,
    } as any);

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});

describe("StudioCard indicators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderCard = (fields: Partial<NormalizedStudio>) =>
    render(
      <StudioCard
        studio={partialStudio({
          id: "7",
          instanceId: "inst-a",
          name: "Studio",
          scene_count: 0,
          image_count: 0,
          tags: [],
          ...fields,
        })}
      />
    );

  it("the performers indicator shows relation_totals.performers", () => {
    renderCard({ performer_count: 40, relation_totals: { performers: 25 } });

    expect(indicator("PERFORMERS").count).toBe(25);
  });

  it("the galleries indicator counts relation_totals.galleries and its grid says how many more", () => {
    renderCard({
      gallery_count: 40,
      galleries: [1, 2].map((i) => ({
        id: String(i),
        instanceId: "inst-a",
        title: `Gallery ${i}`,
        cover: null,
      })),
      relation_totals: { galleries: 30 },
    });

    expect(indicator("GALLERIES").count).toBe(30);
    renderTooltip("GALLERIES");
    expect(screen.getByText("and 28 more")).toBeInTheDocument();
  });
});
