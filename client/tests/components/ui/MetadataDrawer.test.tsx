import { MemoryRouter } from "react-router-dom";
import type { NormalizedImage } from "@peek/shared-types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MetadataDrawer from "../../../src/components/ui/MetadataDrawer";

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("../../../src/components/ui/OCounterButton", () => ({
  default: () => <div data-testid="o-counter" />,
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

function renderDrawer(image: NormalizedImage) {
  return render(
    <MemoryRouter>
      <MetadataDrawer
        open
        onClose={vi.fn()}
        image={image}
        rating={null}
        isFavorite={false}
        oCounter={0}
        onRatingChange={vi.fn()}
        onFavoriteChange={vi.fn()}
        onOCounterChange={vi.fn()}
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
