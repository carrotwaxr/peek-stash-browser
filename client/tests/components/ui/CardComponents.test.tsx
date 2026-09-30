import type { MouseEvent, ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CardDescription,
  CardImage,
  CardMenuRow,
  CardOverlay,
  CardRatingRow,
  CardTitle,
} from "../../../src/components/ui/CardComponents";
import SceneCard from "../../../src/components/ui/SceneCard";

// Hides go through without the confirmation dialog, unless a test turns it on
let mockHideConfirmationDisabled = true;
const mockHideEntity = vi.fn((_hide: Record<string, unknown>) =>
  Promise.resolve(true)
);
vi.mock("../../../src/hooks/useHiddenEntities", () => ({
  useHiddenEntities: () => ({
    hideEntity: mockHideEntity,
    hideConfirmationDisabled: mockHideConfirmationDisabled,
  }),
}));
const mockIncrement = vi.fn((_vars: Record<string, unknown>) =>
  Promise.resolve({ success: true, oCount: 1 })
);
vi.mock("../../../src/api/hooks", () => ({
  useIncrementOCounter: () => ({
    mutateAsync: mockIncrement,
    isPending: false,
  }),
}));

vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({ getSettings: () => ({}) }),
}));
vi.mock("../../../src/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("../../../src/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));
vi.mock("../../../src/components/ui/index", () => ({
  SceneCardPreview: () => null,
  TooltipEntityGrid: () => null,
}));

/** The props of the overlay's root element */
interface OverlayRootProps {
  className: string;
  children: ReactNode;
}

describe("CardOverlay", () => {
  it("renders children in positioned overlay", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "bottom-left",
      children: "Test Content",
    });

    // Check that the component renders with children
    expect(element).toBeDefined();
    expect(element.props.children).toBe("Test Content");
  });

  it("applies correct position classes for bottom-left", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "bottom-left",
      children: "Content",
    });

    expect(element.props.className).toContain("absolute");
    expect(element.props.className).toContain("bottom-0");
    expect(element.props.className).toContain("left-0");
  });

  it("applies correct position classes for top-left", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "top-left",
      children: "Content",
    });

    expect(element.props.className).toContain("absolute");
    expect(element.props.className).toContain("top-0");
    expect(element.props.className).toContain("left-0");
  });

  it("applies correct position classes for bottom-right", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "bottom-right",
      children: "Content",
    });

    expect(element.props.className).toContain("absolute");
    expect(element.props.className).toContain("bottom-0");
    expect(element.props.className).toContain("right-0");
  });

  it("applies correct position classes for full", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "full",
      children: "Content",
    });

    expect(element.props.className).toContain("absolute");
    expect(element.props.className).toContain("inset-0");
  });

  it("applies additional className when provided", () => {
    const element: ReactElement<OverlayRootProps> = CardOverlay({
      position: "bottom-left",
      children: "Content",
      className: "custom-class",
    });

    expect(element.props.className).toContain("custom-class");
  });
});

describe("CardImage", () => {
  it("is a React component function", () => {
    expect(typeof CardImage).toBe("function");
  });

  it("has expected parameter signature", () => {
    // CardImage should accept these props in its signature
    // We verify it's a function that can be stringified without errors
    expect(() => {
      CardImage.toString();
    }).not.toThrow();

    // Verify function contains expected parameters
    const funcString = CardImage.toString();
    expect(funcString).toContain("src");
    expect(funcString).toContain("alt");
    expect(funcString).toContain("aspectRatio");
    expect(funcString).toContain("entityType");
    expect(funcString).toContain("onClick");
  });

  it("calls onClickOverride when clicking Link", () => {
    const onClickOverride = vi.fn((e: MouseEvent) => {
      e.preventDefault();
    });

    render(
      <MemoryRouter>
        <CardImage
          src="/test.jpg"
          linkTo="/scene/1"
          onClickOverride={onClickOverride}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("link"));
    expect(onClickOverride).toHaveBeenCalled();
  });
});

describe("CardDescription", () => {
  it("uses ExpandableDescription internally", () => {
    // CardDescription should delegate to ExpandableDescription
    const funcString = CardDescription.toString();
    expect(funcString).toContain("ExpandableDescription");
  });
});

describe("CardTitle", () => {
  it("calls onClickOverride when clicking title Link", () => {
    const onClickOverride = vi.fn((e: MouseEvent) => {
      e.preventDefault();
    });

    render(
      <MemoryRouter>
        <CardTitle
          title="Test Title"
          linkTo="/scene/1"
          onClickOverride={onClickOverride}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Test Title"));
    expect(onClickOverride).toHaveBeenCalled();
  });

  it("calls onClickOverride when clicking subtitle Link", () => {
    const onClickOverride = vi.fn((e: MouseEvent) => {
      e.preventDefault();
    });

    render(
      <MemoryRouter>
        <CardTitle
          title="Test Title"
          subtitle="Test Subtitle"
          linkTo="/scene/1"
          onClickOverride={onClickOverride}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Test Subtitle"));
    expect(onClickOverride).toHaveBeenCalled();
  });
});

describe("the card's instance", () => {
  /** Opens the card menu and presses its hide item */
  async function hideFromMenu() {
    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByText("Hide Scene"));
    await vi.waitFor(() => expect(mockHideEntity).toHaveBeenCalled());
  }

  it("the card menu's hide and the O button carry the card's instance", async () => {
    const onHideSuccess = vi.fn();
    render(
      <CardRatingRow
        entityType="scene"
        entityId="12"
        instanceId="B"
        initialRating={null}
        initialFavorite={false}
        initialOCounter={0}
        entityTitle="Scene 12"
        onHideSuccess={onHideSuccess}
      />
    );

    await hideFromMenu();
    expect(mockHideEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "scene",
        entityId: "12",
        instanceId: "B",
      })
    );
    await vi.waitFor(() =>
      expect(onHideSuccess).toHaveBeenCalledWith("12", "scene", "B")
    );

    fireEvent.click(screen.getByLabelText(/Increment O counter/));
    await vi.waitFor(() =>
      expect(mockIncrement).toHaveBeenCalledWith({
        sceneId: "12",
        imageId: undefined,
        instanceId: "B",
      })
    );
  });

  it("the standalone menu row's hide carries the card's instance", async () => {
    mockHideEntity.mockClear();
    const onHideSuccess = vi.fn();
    render(
      <CardMenuRow
        entityType="scene"
        entityId="12"
        instanceId="A"
        entityTitle="Scene 12"
        onHideSuccess={onHideSuccess}
      />
    );

    await hideFromMenu();
    expect(mockHideEntity).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "12", instanceId: "A" })
    );
    await vi.waitFor(() =>
      expect(onHideSuccess).toHaveBeenCalledWith("12", "scene", "A")
    );
  });
});

describe("a card's hide dialog", () => {
  afterEach(() => {
    mockHideConfirmationDisabled = true;
  });

  it("cancelling a card's hide by clicking outside the dialog does not open the scene", () => {
    mockHideConfirmationDisabled = false;
    const onClick = vi.fn();
    // Whatever wraps the card (a link, a selectable row) must not see it either
    const onWrapperClick = vi.fn();
    const onWrapperMouseDown = vi.fn();
    const scene = {
      id: "1",
      instanceId: "inst-1",
      title: "Test Scene",
      paths: { screenshot: "/screenshot.jpg" },
      files: [{ duration: 3600 }],
      performers: [],
      groups: [],
      galleries: [],
      tags: [],
      inheritedTags: [],
    } as unknown as NormalizedScene;
    render(
      <MemoryRouter>
        <div onClick={onWrapperClick} onMouseDown={onWrapperMouseDown}>
          <SceneCard scene={scene} onClick={onClick} />
        </div>
      </MemoryRouter>
    );

    fireEvent.click(
      screen.getAllByLabelText("More options").at(-1) as HTMLElement
    );
    fireEvent.click(screen.getByText("Hide Scene"));
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    onWrapperClick.mockClear();
    onWrapperMouseDown.mockClear();
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
    expect(onWrapperClick).not.toHaveBeenCalled();
    expect(onWrapperMouseDown).not.toHaveBeenCalled();
  });
});
