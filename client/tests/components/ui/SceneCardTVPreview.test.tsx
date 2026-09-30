import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { fireEvent, render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Import after mocks
import SceneCard from "../../../src/components/ui/SceneCard";
import type SceneCardPreview from "../../../src/components/ui/SceneCardPreview";
import SceneCarousel from "../../../src/components/ui/SceneCarousel";

type PreviewProps = ComponentProps<typeof SceneCardPreview>;

// Hoisted spies that can be inspected from tests
const { previewSpy, mockUseTVMode } = vi.hoisted(() => ({
  previewSpy: vi.fn<(props: PreviewProps) => void>(),
  mockUseTVMode: vi.fn(() => ({ isTVMode: false })),
}));

// Mock TV mode hook so we can toggle behavior deterministically
vi.mock("../../../src/hooks/useTVMode", () => ({
  useTVMode: () => mockUseTVMode(),
}));

// Mock ConfigContext used for link building
vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));

// Mock CardDisplaySettingsContext (SceneCard expects settings)
vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({
      showCodeOnCard: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: false,
      showDescriptionOnCard: true,
      showRating: false,
      showFavorite: false,
      showOCounter: false,
      showMenu: false,
    }),
  }),
}));

// Mock SceneCardPreview to capture props passed from SceneCard
vi.mock("../../../src/components/ui/SceneCardPreview", () => ({
  default: (props: PreviewProps) => {
    previewSpy(props);
    return <div data-testid="scene-preview" />;
  },
}));

/** SceneCard renders from these fields; the rest are left out */
const partialScene = (
  fields: Partial<Omit<NormalizedScene, "paths">> & {
    paths: Partial<NormalizedScene["paths"]>;
  }
) => fields as NormalizedScene;

describe("SceneCard (TV Mode) preview activation wiring", () => {
  const scene = partialScene({
    id: "scene-1",
    title: "Test Scene",
    paths: { screenshot: "/screenshot.jpg" },
    files: [],
    performers: [],
    groups: [],
    galleries: [],
    tags: [],
    inheritedTags: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** The preview's props from its last render */
  const lastPreviewProps = () =>
    must(previewSpy.mock.lastCall, "the preview's props")[0];

  it("in TV mode a card that has no focus does not preview, and hover is off", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: true });

    render(
      <MemoryRouter>
        <SceneCard scene={scene} hideRatingControls />
      </MemoryRouter>
    );

    expect(lastPreviewProps().disableHover).toBe(true);
    expect(lastPreviewProps().active).toBe(false);
  });

  it("in TV mode a focused card plays its preview; blur stops it", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: true });

    render(
      <MemoryRouter>
        <SceneCard scene={scene} hideRatingControls />
      </MemoryRouter>
    );
    const card = screen.getByLabelText("Scene");

    fireEvent.focus(card);
    expect(lastPreviewProps().active).toBe(true);

    fireEvent.blur(card);
    expect(lastPreviewProps().active).toBe(false);
  });

  it("in TV mode a focused card inside a carousel plays its preview; blur stops it", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: true });

    render(
      <MemoryRouter>
        <SceneCarousel title="Recent" scenes={[scene]} />
      </MemoryRouter>
    );
    const card = screen.getByLabelText("Scene");

    fireEvent.focus(card);
    expect(lastPreviewProps().active).toBe(true);

    fireEvent.blur(card);
    expect(lastPreviewProps().active).toBe(false);
  });

  it("focus moving between the card's own controls keeps the preview playing", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: true });

    render(
      <MemoryRouter>
        <SceneCard scene={scene} hideRatingControls />
      </MemoryRouter>
    );
    const card = screen.getByLabelText("Scene");
    const inner = must(
      card.querySelector("a, button"),
      "a control in the card"
    );

    fireEvent.focus(card);
    fireEvent.blur(card, { relatedTarget: inner });

    expect(lastPreviewProps().active).toBe(true);
  });

  it("does not disable hover and does not force activation in non-TV mode", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: false });

    render(
      <MemoryRouter>
        <SceneCard scene={scene} hideRatingControls />
      </MemoryRouter>
    );
    fireEvent.focus(screen.getByLabelText("Scene"));

    expect(lastPreviewProps().disableHover).toBe(false);
    expect(lastPreviewProps().active).toBeUndefined();
  });
});
