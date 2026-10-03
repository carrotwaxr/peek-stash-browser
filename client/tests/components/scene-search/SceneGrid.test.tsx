import type { ComponentProps } from "react";
import type { NormalizedScene } from "@peek/shared-types";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouterWithQuery } from "@tests/helpers/MemoryRouterWithQuery";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SceneGrid from "../../../src/components/scene-search/SceneGrid";
import type * as uiModule from "../../../src/components/ui/index";
import type { SceneCard } from "../../../src/components/ui/index";

type CardProps = ComponentProps<typeof SceneCard>;

const { cardSpy } = vi.hoisted(() => ({
  cardSpy: vi.fn<(props: CardProps) => void>(),
}));

vi.mock("../../../src/components/ui/index", async (importOriginal) => {
  const actual = await importOriginal<typeof uiModule>();
  return {
    ...actual,
    // A card is its checkbox: pressed when selected, shift reports a range
    SceneCard: (props: CardProps) => {
      cardSpy(props);
      const { scene, onToggleSelect, isSelected } = props;
      if (!onToggleSelect) return null;
      return (
        <button
          data-testid={`card-${scene.id}-${scene.instanceId}`}
          aria-pressed={isSelected}
          onClick={(e) => onToggleSelect(scene, { range: e.shiftKey })}
        />
      );
    },
  };
});
// The shared empty state, as a stub naming what it was given
vi.mock("../../../src/components/ui/EmptyState", () => ({
  default: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
  }) => (
    <div data-testid="empty-state">
      {title}
      {description ? ` | ${description}` : ""}
    </div>
  ),
}));
vi.mock("../../../src/hooks/useHideBulkAction", () => ({
  useHideBulkAction: () => ({
    hideDialogOpen: false,
    isHiding: false,
    handleHideClick: vi.fn(),
    handleHideConfirm: vi.fn(),
    closeHideDialog: vi.fn(),
  }),
}));

const scene = { id: "1", instanceId: "a", title: "One" } as NormalizedScene;

describe("SceneGrid autoplay on scroll", () => {
  beforeEach(() => {
    cardSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Renders the grid while CSS lays out `tracks` */
  const renderWithTracks = (tracks: string) => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ gridTemplateColumns: tracks }) as CSSStyleDeclaration
    );
    render(
      <MemoryRouterWithQuery>
        <SceneGrid scenes={[scene]} />
      </MemoryRouterWithQuery>
    );
    return must(cardSpy.mock.lastCall, "a card render")[0];
  };

  it("plays previews on scroll when the grid renders one column", () => {
    expect(renderWithTracks("400px").autoplayOnScroll).toBe(true);
  });

  it("does not when it renders several columns", () => {
    expect(renderWithTracks("200px 200px 200px").autoplayOnScroll).toBe(false);
  });
});

describe("SceneGrid empty list", () => {
  it("an empty list shows EmptyState with the page's message", () => {
    render(
      <MemoryRouterWithQuery>
        <SceneGrid
          scenes={[]}
          emptyMessage="No scenes found"
          emptyDescription="Try adjusting your search filters"
        />
      </MemoryRouterWithQuery>
    );

    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "No scenes found | Try adjusting your search filters"
    );
  });
});

describe("SceneGrid selection", () => {
  const sceneList = (ids: string[], instanceId = "a") =>
    ids.map((id) => ({ id, instanceId, title: id }) as NormalizedScene);

  const pressed = () =>
    screen
      .getAllByTestId(/^card-/)
      .filter((el) => el.getAttribute("aria-pressed") === "true")
      .map((el) => el.getAttribute("data-testid"));

  const renderGrid = (props: Partial<ComponentProps<typeof SceneGrid>>) => {
    const tree = (p: Partial<ComponentProps<typeof SceneGrid>>) => (
      <MemoryRouterWithQuery>
        <SceneGrid scenes={sceneList(["1", "2", "3", "4", "5", "6"])} {...p} />
      </MemoryRouterWithQuery>
    );
    const view = render(tree(props));
    return {
      ...view,
      update: (next: Partial<ComponentProps<typeof SceneGrid>>) =>
        view.rerender(tree({ ...props, ...next })),
    };
  };

  it("selecting 3 then changing the filter (a new selectionScope) clears the selection and the bulk bar", () => {
    const { update } = renderGrid({ selectionScope: "filter-a" });
    for (const id of ["1", "2", "3"]) {
      fireEvent.click(screen.getByTestId(`card-${id}-a`));
    }
    expect(pressed()).toHaveLength(3);
    expect(screen.getByText("Clear")).toBeInTheDocument();

    update({ selectionScope: "filter-b" });

    expect(pressed()).toEqual([]);
    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
  });

  it("the same selectionScope keeps the selection through a refetch", () => {
    const { update } = renderGrid({ selectionScope: "filter-a" });
    fireEvent.click(screen.getByTestId("card-2-a"));
    update({
      scenes: sceneList(["1", "2", "3", "4", "5", "6"]),
      selectionScope: "filter-a",
    });
    expect(pressed()).toEqual(["card-2-a"]);
  });

  it("a page change clears the selection", () => {
    renderGrid({
      selectionScope: "p1",
      currentPage: 1,
      totalPages: 3,
      onPageChange: vi.fn(),
    });
    fireEvent.click(screen.getByTestId("card-2-a"));
    expect(pressed()).toHaveLength(1);

    fireEvent.click(must(screen.getAllByRole("button", { name: /next/i })[0]));

    expect(pressed()).toEqual([]);
  });

  it("Select All selects exactly the visible page", () => {
    renderGrid({ selectionScope: "p1" });
    fireEvent.click(screen.getByTestId("card-1-a"));
    fireEvent.click(screen.getByRole("button", { name: "Select All (6)" }));

    expect(pressed()).toHaveLength(6);
  });

  it("the first selection puts nothing above the grid, so no card moves", () => {
    renderGrid({ selectionScope: "p1" });
    const grid = must(screen.getByTestId("card-1-a").parentElement);
    const above = () => grid.previousElementSibling;
    expect(above()).toBeNull();

    fireEvent.click(screen.getByTestId("card-1-a"));

    expect(above()).toBeNull();
    expect(
      screen.getByRole("button", { name: "Select All (6)" })
    ).toBeVisible();
  });

  it("click card 2's checkbox, shift-click card 5's: cards 2 to 5 are selected", () => {
    renderGrid({ selectionScope: "p1" });
    fireEvent.click(screen.getByTestId("card-2-a"));
    fireEvent.click(screen.getByTestId("card-5-a"), { shiftKey: true });

    expect(pressed()).toEqual(["card-2-a", "card-3-a", "card-4-a", "card-5-a"]);
  });

  it("a shift-click with no earlier click selects just that card", () => {
    renderGrid({ selectionScope: "p1" });
    fireEvent.click(screen.getByTestId("card-4-a"), { shiftKey: true });

    expect(pressed()).toEqual(["card-4-a"]);
  });

  it("a range forgets its anchor when the scope changes", () => {
    const { update } = renderGrid({ selectionScope: "p1" });
    fireEvent.click(screen.getByTestId("card-2-a"));
    update({ selectionScope: "p2" });
    fireEvent.click(screen.getByTestId("card-5-a"), { shiftKey: true });

    expect(pressed()).toEqual(["card-5-a"]);
  });

  it("with B:12 and A:12 on the page, selecting B:12 does not mark A:12", () => {
    const scenes = [...sceneList(["12"], "a"), ...sceneList(["12"], "b")];
    renderGrid({ scenes, selectionScope: "p1" });
    fireEvent.click(screen.getByTestId("card-12-b"));

    expect(pressed()).toEqual(["card-12-b"]);
  });

  it("a range over two servers' scenes with one id selects each by its instance", () => {
    const scenes = [
      ...sceneList(["12"], "a"),
      ...sceneList(["12"], "b"),
      ...sceneList(["13"], "a"),
    ];
    renderGrid({ scenes, selectionScope: "p1" });
    fireEvent.click(screen.getByTestId("card-12-b"));
    fireEvent.click(screen.getByTestId("card-13-a"), { shiftKey: true });

    expect(pressed()).toEqual(["card-12-b", "card-13-a"]);
  });
});
