import { MemoryRouter } from "react-router-dom";
import type { ImageListItem } from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MetadataDrawer from "../../../src/components/ui/MetadataDrawer";
import { controlMatchMedia } from "../../helpers/matchMedia";

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("../../../src/components/ui/OCounterButton", () => ({
  default: () => <div data-testid="o-counter" />,
}));
const mockDecrementImage = vi.fn(
  (_vars: { imageId: string; instanceId: string }) =>
    Promise.resolve({ success: true as const, oCount: 2 })
);
vi.mock("../../../src/api/hooks", () => ({
  useDecrementImageOCounter: () => ({
    mutateAsync: mockDecrementImage,
    isPending: false,
  }),
}));
vi.mock("../../../src/components/ui/FavoriteButton", () => ({
  default: () => <div data-testid="favorite" />,
}));
vi.mock("../../../src/components/ui/RatingBadge", () => ({
  default: () => <div data-testid="rating-badge" />,
}));
vi.mock("../../../src/components/ui/RatingSliderDialog", () => ({
  default: () => null,
}));

function makeImage(overrides: Partial<ImageListItem> = {}): ImageListItem {
  return {
    id: "1",
    instanceId: "inst-a",
    title: "A picture",
    code: null,
    details: null,
    photographer: null,
    urls: [],
    date: null,
    studio: null,
    studioId: null,
    rating100: null,
    favorite: false,
    oCounter: 0,
    viewCount: 0,
    lastViewedAt: null,
    organized: false,
    filePath: null,
    width: null,
    height: null,
    fileSize: null,
    paths: { thumbnail: null, preview: null, image: null },
    performers: [],
    tags: [],
    galleries: [],
    stashCreatedAt: null,
    stashUpdatedAt: null,
    ...overrides,
  };
}

function renderDrawer(
  image: ImageListItem,
  oCounter = 0,
  onOCounterChange: (count: number) => void = vi.fn()
) {
  return render(
    <MemoryRouter>
      <MetadataDrawer
        open
        onClose={vi.fn()}
        image={image}
        rating={null}
        isFavorite={false}
        oCounter={oCounter}
        onRatingChange={vi.fn()}
        onFavoriteChange={vi.fn()}
        onOCounterChange={onOCounterChange}
      />
    </MemoryRouter>
  );
}

describe("MetadataDrawer subtitle", () => {
  it("an image with only a photographer shows 'by <name>'", () => {
    renderDrawer(makeImage({ photographer: "Ansel" }));
    expect(screen.getByText("by Ansel")).toBeInTheDocument();
  });

  it("studio, date, photographer and resolution render in that order with separators, studio as a link", () => {
    const date = "2024-03-05";
    const { container } = renderDrawer(
      makeImage({
        studio: {
          id: "9",
          instanceId: "inst-a",
          name: "Acme",
          image_path: null,
          parent_studio: null,
        },
        date,
        photographer: "Ansel",
        width: 1920,
        height: 1080,
      })
    );
    const subtitle = container.querySelector("p");
    expect(subtitle).not.toBeNull();
    expect(subtitle?.textContent).toBe(
      "Acme • Mar 5, 2024 • by Ansel • 1920×1080"
    );
    const link = screen.getByRole("link", { name: "Acme" });
    expect(link).toHaveAttribute("href", "/studio/9");
  });
});

describe("MetadataDrawer orientation", () => {
  it("the drawer follows a landscape change", () => {
    const media = controlMatchMedia();
    try {
      const { container } = renderDrawer(makeImage());
      // The drawer's handle is a wide bar in portrait, a tall one in landscape
      expect(container.querySelector(".w-10.h-1")).not.toBeNull();

      act(() => media.set("(orientation: landscape)", true));

      expect(container.querySelector(".h-10.w-1")).not.toBeNull();
      expect(container.querySelector(".w-10.h-1")).toBeNull();
    } finally {
      media.restore();
    }
  });
});

describe("MetadataDrawer Remove last O", () => {
  it("the image viewer offers Remove last O beside the O counter, which calls the image decrement", async () => {
    const onOCounterChange = vi.fn((_count: number) => {});
    renderDrawer(
      makeImage({ id: "5", instanceId: "inst-b" }),
      3,
      onOCounterChange
    );

    expect(screen.getByTestId("o-counter")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("More options"));
    expect(screen.queryByText("Hide Image")).toBeNull();
    fireEvent.click(screen.getByText("Remove last O"));

    await waitFor(() => expect(onOCounterChange).toHaveBeenCalledWith(2));
    expect(mockDecrementImage).toHaveBeenCalledWith({
      imageId: "5",
      instanceId: "inst-b",
    });
  });

  it("at 0 Os the image viewer shows no menu", () => {
    renderDrawer(makeImage(), 0);

    expect(screen.queryByLabelText("More options")).toBeNull();
  });
});
