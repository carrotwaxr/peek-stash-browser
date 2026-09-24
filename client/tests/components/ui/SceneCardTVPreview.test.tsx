import type { ComponentProps, ReactNode } from "react";
import type * as routerModule from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { render } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Import after mocks
import SceneCard from "../../../src/components/ui/SceneCard";
import type SceneCardPreview from "../../../src/components/ui/SceneCardPreview";

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

// Mock react-router-dom's useNavigate to avoid requiring router context
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof routerModule>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock BaseCard so we only render the image content slot (where SceneCardPreview is mounted)
vi.mock("../../../src/components/ui/BaseCard", () => ({
  default: ({
    renderImageContent,
  }: {
    renderImageContent?: () => ReactNode;
  }) => <div data-testid="base-card">{renderImageContent?.()}</div>,
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

  it("disables hover and activates preview when highlighted in TV mode", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: true });

    render(<SceneCard scene={scene} tvPreviewActive={true} tabIndex={0} />);

    expect(previewSpy).toHaveBeenCalledTimes(1);
    const props = must(previewSpy.mock.calls[0])[0];

    expect(props.disableHover).toBe(true);
    expect(props.active).toBe(true);
  });

  it("disables hover and does not activate preview when not highlighted in TV mode", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: true });

    render(<SceneCard scene={scene} tvPreviewActive={false} tabIndex={-1} />);

    expect(previewSpy).toHaveBeenCalledTimes(1);
    const props = must(previewSpy.mock.calls[0])[0];

    expect(props.disableHover).toBe(true);
    expect(props.active).toBe(false);
  });

  it("does not disable hover and does not force activation in non-TV mode", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: false });

    render(<SceneCard scene={scene} tvPreviewActive={true} tabIndex={0} />);

    expect(previewSpy).toHaveBeenCalledTimes(1);
    const props = must(previewSpy.mock.calls[0])[0];

    expect(props.disableHover).toBe(false);
    expect(props.active).toBeUndefined();
  });
});
