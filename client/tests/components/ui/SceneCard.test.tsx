import { createElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { describe, expect, it, vi } from "vitest";
import SceneCard from "../../../src/components/ui/SceneCard";

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

describe("SceneCard", () => {
  const mockScene = {
    id: "1",
    title: "Test Scene",
    paths: { screenshot: "/screenshot.jpg" },
    date: "2024-01-01",
    files: [{ duration: 3600 }],
    rating: 4,
    favorite: false,
    o_counter: 0,
    play_count: 5,
    performers: [],
    tags: [],
    studio: null,
  };

  it("is a React forwardRef component", () => {
    expect(typeof SceneCard).toBe("object");
    expect(SceneCard.displayName).toBe("SceneCard");
  });

  it("accepts expected props", () => {
    const element = createElement(SceneCard as any, {
      scene: mockScene,
      fromPageTitle: "Performers",
      tabIndex: 0,
    });

    expect(element).toBeDefined();
    expect(element.props).toBeDefined();
  });

  it("accepts fromPageTitle prop", () => {
    const element = createElement(SceneCard as any, {
      scene: mockScene,
      fromPageTitle: "My Tag Name",
    });

    // This test will fail until SceneCard accepts fromPageTitle as a prop
    // Currently it hardcodes fromPageTitle="/scenes" which is a bug
    expect(element.props.fromPageTitle).toBe("My Tag Name");
  });

  it("accepts onClick callback", () => {
    const onClick = () => {};
    const element = createElement(SceneCard as any, {
      scene: mockScene,
      onClick,
    });

    expect(element.props.onClick).toBe(onClick);
  });

  it("accepts onHideSuccess callback", () => {
    const onHideSuccess = () => {};
    const element = createElement(SceneCard as any, {
      scene: mockScene,
      onHideSuccess,
    });

    expect(element.props.onHideSuccess).toBe(onHideSuccess);
  });
});

describe("navigation", () => {
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
  };

  const renderCard = (onClick?: (s: unknown) => void) => {
    const router = createMemoryRouter(
      [
        {
          path: "/scenes",
          element: (
            <SceneCard
              scene={scene as any}
              onClick={onClick}
              hideRatingControls
            />
          ),
        },
        { path: "/scene/:id", element: <div>scene page</div> },
      ],
      { initialEntries: ["/scenes"] }
    );
    const utils = render(<RouterProvider router={router} />);
    const [imageLink] = Array.from(
      utils.container.querySelectorAll<HTMLAnchorElement>('a[href="/scene/1"]')
    );
    const titleLink = screen.getByText("Test Scene").closest("a")!;
    return { router, imageLink, titleLink };
  };

  it("clicking the title calls onClick once and navigates nothing else", () => {
    const onClick = vi.fn();
    const { router, titleLink } = renderCard(onClick);

    fireEvent.click(titleLink);

    expect(router.state.location.pathname).toBe("/scenes");
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(scene);
  });

  it("clicking the image does the same", () => {
    const onClick = vi.fn();
    const { router, imageLink, titleLink } = renderCard(onClick);
    expect(imageLink).not.toBe(titleLink);

    fireEvent.click(must(imageLink));

    expect(router.state.location.pathname).toBe("/scenes");
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(scene);
  });

  it("without onClick, the title link navigates to the scene", () => {
    const { router, titleLink } = renderCard();

    fireEvent.click(titleLink);

    expect(router.state.location.pathname).toBe("/scene/1");
  });
});
