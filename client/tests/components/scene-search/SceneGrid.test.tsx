import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { render, screen } from "@testing-library/react";
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
    SceneCard: (props: CardProps) => {
      cardSpy(props);
      return null;
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
      <MemoryRouter>
        <SceneGrid scenes={[scene]} />
      </MemoryRouter>
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
      <MemoryRouter>
        <SceneGrid
          scenes={[]}
          emptyMessage="No scenes found"
          emptyDescription="Try adjusting your search filters"
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "No scenes found | Try adjusting your search filters"
    );
  });
});
