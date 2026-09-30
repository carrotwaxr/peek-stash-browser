import { createElement } from "react";
import type * as routerModule from "react-router-dom";
import { MemoryRouter } from "react-router-dom";
import type { NormalizedPerformer, StudioRef } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PerformerCard from "../../../src/components/cards/PerformerCard";
import type * as uiModule from "../../../src/components/ui/BaseCard";
import type { BaseCardProps } from "../../../src/components/ui/BaseCard";

const { baseCardProps, real } = vi.hoisted(() => ({
  baseCardProps: vi.fn<(props: BaseCardProps) => void>(),
  // Set for the cases that render the real BaseCard into the DOM
  real: { on: false },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof routerModule>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { hideConfirmationDisabled: false },
    updateUser: vi.fn(),
  }),
}));
vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({ showRelationshipIndicators: true }),
  }),
}));
// Captures the indicators the card hands to BaseCard
vi.mock("../../../src/components/ui/BaseCard", async (importOriginal) => {
  const actual = await importOriginal<typeof uiModule>();
  return {
    BaseCard: (props: BaseCardProps) => {
      baseCardProps(props);
      return real.on ? <actual.BaseCard {...props} /> : null;
    },
  };
});

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

/** PerformerCard renders from these fields; the rest are left out */
const partialPerformer = (fields: Partial<NormalizedPerformer>) =>
  fields as NormalizedPerformer;

describe("PerformerCard", () => {
  const mockPerformer = {
    id: "1",
    name: "Test Performer",
    gender: "FEMALE",
    image_path: "/test.jpg",
    scene_count: 10,
    group_count: 2,
    image_count: 5,
    gallery_count: 3,
    play_count: 15,
    tags: [{ id: "1", name: "Tag 1" }],
    o_counter: 5,
    rating100: 80,
    favorite: true,
  };

  it("is a React forwardRef component", () => {
    expect(typeof PerformerCard).toBe("object");
    expect(PerformerCard.displayName).toBe("PerformerCard");
  });

  it("accepts expected props", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
      fromPageTitle: "Performers",
      tabIndex: 0,
    } as any);

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("passes correct entity type to BaseCard", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
    } as any);

    expect(element.props.performer).toBe(mockPerformer);
  });

  it("passes correct link path", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
    } as any);

    expect(element.props.performer.id).toBe("1");
  });

  it("passes performer with all data", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
    } as any);

    const performer = element.props.performer;
    expect(performer.name).toBe("Test Performer");
    expect(performer.gender).toBe("FEMALE");
    expect(performer.scene_count).toBe(10);
    expect(performer.play_count).toBe(15);
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
      fromPageTitle: "Performers",
    } as any);

    expect(element.props.fromPageTitle).toBe("Performers");
  });

  it("accepts tabIndex prop", () => {
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
      tabIndex: 5,
    } as any);

    expect(element.props.tabIndex).toBe(5);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(PerformerCard, {
      performer: mockPerformer,
      onHideSuccess,
    } as any);

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});

describe("PerformerCard hide name", () => {
  it("names the performer, not its JSX title, in the hide dialog and toast", () => {
    render(
      <PerformerCard
        performer={partialPerformer({
          id: "7",
          instanceId: "inst-a",
          name: "Jane Doe",
          tags: [],
        })}
      />
    );

    const props = must(baseCardProps.mock.lastCall, "BaseCard's props")[0];
    expect(props.ratingControlsProps?.entityTitle).toBe("Jane Doe");
  });
});

describe("PerformerCard indicators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const studio = (i: number): StudioRef => ({
    id: String(i),
    instanceId: "inst-a",
    name: `Studio ${i}`,
    image_path: null,
    parent_studio: null,
  });

  it("the studios indicator shows relation_totals.studios and its grid says how many more", () => {
    render(
      <PerformerCard
        performer={partialPerformer({
          id: "7",
          instanceId: "inst-a",
          name: "Performer",
          scene_count: 0,
          image_count: 0,
          tags: [],
          studios: Array.from({ length: 12 }, (_, i) => studio(i + 1)),
          relation_totals: { studios: 20 },
        })}
      />
    );

    expect(indicator("STUDIOS").count).toBe(20);
    renderTooltip("STUDIOS");
    expect(screen.getByText("and 8 more")).toBeInTheDocument();
  });
});

describe("PerformerCard DOM", () => {
  it("renders no unknown DOM attributes", () => {
    real.on = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <PerformerCard
              performer={partialPerformer({
                id: "7",
                instanceId: "inst-a",
                name: "Jane Doe",
                tags: [],
              })}
              tabIndex={0}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const complaints = error.mock.calls.filter((call) =>
        String(call[0]).includes("does not recognize")
      );
      expect(complaints).toEqual([]);
    } finally {
      real.on = false;
      error.mockRestore();
    }
  });
});
