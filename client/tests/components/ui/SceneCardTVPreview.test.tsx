import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Hoisted spies that can be inspected from tests
const { previewSpy, mockUseTVMode } = vi.hoisted(() => ({
  previewSpy: vi.fn(),
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
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock BaseCard so we only render the image content slot (where SceneCardPreview is mounted)
vi.mock("../../../src/components/ui/BaseCard", () => ({
  default: ({ renderImageContent }: { renderImageContent?: () => unknown }) => (
    <div data-testid="base-card">{renderImageContent?.() as any}</div>
  ),
}));

// Mock SceneCardPreview to capture props passed from SceneCard
vi.mock("../../../src/components/ui/SceneCardPreview", () => ({
  default: (props: Record<string, unknown>) => {
    previewSpy(props);
    return <div data-testid="scene-preview" />;
  },
}));

// Import after mocks
import SceneCard from "../../../src/components/ui/SceneCard";

describe("SceneCard (TV Mode) preview activation wiring", () => {
  const scene = {
    id: "scene-1",
    title: "Test Scene",
    paths: { screenshot: "/screenshot.jpg" },
    files: [],
    performers: [],
    groups: [],
    galleries: [],
    tags: [],
    inheritedTags: [],
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables hover and activates preview when highlighted in TV mode", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: true });

    render(<SceneCard scene={scene} tvPreviewActive={true} tabIndex={0} />);

    expect(previewSpy).toHaveBeenCalledTimes(1);
    const props = previewSpy.mock.calls[0][0] as any;

    expect(props.disableHover).toBe(true);
    expect(props.active).toBe(true);
  });

  it("disables hover and does not activate preview when not highlighted in TV mode", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: true });

    render(<SceneCard scene={scene} tvPreviewActive={false} tabIndex={-1} />);

    expect(previewSpy).toHaveBeenCalledTimes(1);
    const props = previewSpy.mock.calls[0][0] as any;

    expect(props.disableHover).toBe(true);
    expect(props.active).toBe(false);
  });

  it("does not disable hover and does not force activation in non-TV mode", () => {
    mockUseTVMode.mockReturnValue({ isTVMode: false });

    render(<SceneCard scene={scene} tvPreviewActive={true} tabIndex={0} />);

    expect(previewSpy).toHaveBeenCalledTimes(1);
    const props = previewSpy.mock.calls[0][0] as any;

    expect(props.disableHover).toBe(false);
    expect(props.active).toBeUndefined();
  });
});
