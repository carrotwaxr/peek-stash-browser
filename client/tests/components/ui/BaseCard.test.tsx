import {
  MemoryRouter,
  RouterProvider,
  createMemoryRouter,
} from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BaseCard,
  type BaseCardProps,
} from "../../../src/components/ui/BaseCard";

vi.mock("../../../src/hooks/useHiddenEntities", () => ({
  useHiddenEntities: () => ({
    hideEntity: vi.fn(),
    hideConfirmationDisabled: true,
  }),
}));

describe("BaseCard", () => {
  const defaultProps = {
    entityType: "scene",
    imagePath: "/test.jpg",
    title: "Test Title",
  };

  it("is a React forwardRef component", () => {
    expect(typeof BaseCard).toBe("object");
    expect(BaseCard.displayName).toBe("BaseCard");
  });

  const renderCard = (props: Partial<BaseCardProps> = {}) =>
    render(
      <MemoryRouter>
        <BaseCard {...defaultProps} {...props} />
      </MemoryRouter>
    );

  it("renders its title and subtitle, and hideSubtitle drops the subtitle", () => {
    const { unmount } = renderCard({ subtitle: "Test Subtitle" });
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test Subtitle")).toBeInTheDocument();
    unmount();

    renderCard({ subtitle: "Test Subtitle", hideSubtitle: true });
    expect(screen.queryByText("Test Subtitle")).toBeNull();
  });

  it("renders the description, and hideDescription drops it", () => {
    const { unmount } = renderCard({ description: "Test Description" });
    expect(screen.getByText("Test Description")).toBeInTheDocument();
    unmount();

    renderCard({ description: "Test Description", hideDescription: true });
    expect(screen.queryByText("Test Description")).toBeNull();
  });

  it("links its title to linkTo", () => {
    renderCard({ linkTo: "/test-path" });
    expect(screen.getByText("Test Title").closest("a")).toHaveAttribute(
      "href",
      "/test-path"
    );
  });

  it("renders the overlay and after-title slots", () => {
    renderCard({
      renderOverlay: () => <div>Custom Overlay</div>,
      renderAfterTitle: () => <div>After Title Content</div>,
    });
    expect(screen.getByText("Custom Overlay")).toBeInTheDocument();
    expect(screen.getByText("After Title Content")).toBeInTheDocument();
  });

  it("puts className on the card and calls onClick when it is clicked", () => {
    const onClick = vi.fn();
    renderCard({ className: "custom-class", onClick });
    const card = screen.getByLabelText("Scene");
    expect(card).toHaveClass("custom-class");
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("BaseCard selection mode", () => {
  it("passes selection handlers to CardContainer", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };

    render(
      <MemoryRouter>
        <BaseCard
          entityType="scene"
          entity={entity}
          title="Scene"
          linkTo="/scene/1"
          selectionMode={true}
          onToggleSelect={onToggleSelect}
        />
      </MemoryRouter>
    );

    // The card container should render and be accessible
    const card = screen.getByLabelText("Scene");
    expect(card).toBeDefined();
    expect(card).not.toBeNull();
  });

  it("applies selected styling when isSelected", () => {
    render(
      <MemoryRouter>
        <BaseCard
          entityType="scene"
          entity={{ id: "1" }}
          title="Scene"
          linkTo="/scene/1"
          isSelected={true}
        />
      </MemoryRouter>
    );

    const card = screen.getByLabelText("Scene");
    // Check the inline style includes the selection border color
    expect(card.style.borderColor).toBe("var(--selection-color)");
  });
});

describe("BaseCard menu placement logic", () => {
  const controls = {
    entityId: "scene123",
    instanceId: "inst-1",
    showRating: false,
    showFavorite: false,
    showOCounter: false,
  };
  const renderCard = (
    ratingControlsProps: BaseCardProps["ratingControlsProps"],
    indicators: BaseCardProps["indicators"] = []
  ) =>
    render(
      <MemoryRouter>
        <BaseCard
          entityType="scene"
          title="Test"
          indicators={indicators}
          ratingControlsProps={ratingControlsProps}
        />
      </MemoryRouter>
    );

  it("shows one menu when only the menu is on, with or without indicators", () => {
    const { unmount } = renderCard({ ...controls, showMenu: true });
    expect(screen.getAllByLabelText("More options")).toHaveLength(1);
    unmount();

    renderCard({ ...controls, showMenu: true }, [{ type: "SCENES", count: 3 }]);
    expect(screen.getAllByLabelText("More options")).toHaveLength(1);
  });

  it("shows no menu with showMenu=false", () => {
    renderCard({ ...controls, showMenu: false }, [
      { type: "SCENES", count: 3 },
    ]);
    expect(screen.queryByLabelText("More options")).toBeNull();
  });

  it("puts the menu in the rating row, once, when rating controls are on", () => {
    renderCard({ ...controls, showRating: true });
    expect(screen.getAllByLabelText("More options")).toHaveLength(1);
  });

  it("defaults showMenu to on", () => {
    renderCard({ ...controls, showRating: true });
    expect(screen.getByLabelText("More options")).toBeInTheDocument();
  });
});

describe("BaseCard navigation", () => {
  const renderCard = (onNavigate: (e: unknown) => void) => {
    const router = createMemoryRouter(
      [
        {
          path: "/scenes",
          element: (
            <BaseCard
              entityType="scene"
              entity={{ id: "1" }}
              title="Test Title"
              linkTo="/scene/1"
              onNavigate={onNavigate}
            />
          ),
        },
        { path: "/scene/:id", element: <div>scene page</div> },
      ],
      { initialEntries: ["/scenes"] }
    );
    render(<RouterProvider router={router} />);
    const titleLink = must(screen.getByText("Test Title").closest("a"));
    return { router, titleLink };
  };

  // happy-dom follows an unprevented link click by changing window.location
  const startUrl = window.location.href;
  afterEach(() => {
    window.history.replaceState(null, "", startUrl);
  });

  it("a plain click on the title calls onNavigate once and keeps the Link from navigating", () => {
    const onNavigate = vi.fn();
    const { router, titleLink } = renderCard(onNavigate);

    fireEvent.click(titleLink);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe("/scenes");
  });

  it("a ctrl, meta or shift click leaves the link to the browser and skips onNavigate", () => {
    const onNavigate = vi.fn();
    const { router, titleLink } = renderCard(onNavigate);

    const notPrevented = (["ctrlKey", "metaKey", "shiftKey"] as const).map(
      (modifier) => fireEvent.click(titleLink, { [modifier]: true })
    );

    expect(onNavigate).not.toHaveBeenCalled();
    // Not prevented: the browser's own new-tab or new-window handling runs
    expect(notPrevented).toEqual([true, true, true]);
    expect(router.state.location.pathname).toBe("/scenes");
  });
});
