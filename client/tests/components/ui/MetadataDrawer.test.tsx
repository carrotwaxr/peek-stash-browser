import { MemoryRouter } from "react-router-dom";
import type { NormalizedImage } from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MetadataDrawer from "../../../src/components/ui/MetadataDrawer";

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

function makeImage(overrides: Partial<NormalizedImage> = {}): NormalizedImage {
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
    o_counter: 0,
    organized: false,
    filePath: null,
    width: null,
    height: null,
    fileSize: null,
    files: [],
    paths: { thumbnail: "", preview: "", image: "" },
    performers: [],
    tags: [],
    galleries: [],
    ...overrides,
  } as NormalizedImage;
}

function renderDrawer(
  image: NormalizedImage,
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
        studio: { id: "9", name: "Acme" },
        date,
        photographer: "Ansel",
        width: 1920,
        height: 1080,
      })
    );
    const subtitle = container.querySelector("p");
    expect(subtitle).not.toBeNull();
    expect(subtitle?.textContent).toBe(
      `Acme • ${new Date(date).toLocaleDateString()} • by Ansel • 1920×1080`
    );
    const link = screen.getByRole("link", { name: "Acme" });
    expect(link).toHaveAttribute("href", "/studio/9");
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
